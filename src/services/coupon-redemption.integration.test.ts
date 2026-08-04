import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 4 — coupon redemption + admin service INTEGRATION tests against the real Postgres RPCs.
 *
 * These exercise the ACTUAL domain/service layer (couponRedemptionService + couponAdminService) and
 * the race-safe SECURITY DEFINER RPCs — things a mock cannot prove: per-customer / global limits, the
 * reserve → consume → release/restore lifecycle, idempotency (retry / webhook replay), the concurrent
 * final-slot row lock, refund-retain vs cancel-release, duplicate/archive/audit, and historical
 * snapshot immutability after a coupon edit.
 *
 * Gated on Supabase credentials — skips cleanly in CI without them. Fully self-cleaning.
 */

// Load .env.local into process.env BEFORE the services construct their PostgREST client (lazy, per-call).
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — the guard below skips */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = !!(URL && KEY);
const d = RUN ? describe : describe.skip;

const H = { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" };
const TAG = "P4INT";
const created = { coupons: [] as string[], orders: [] as string[] };

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const seedCoupon = async (over: Record<string, unknown>) => {
  const row = await rest("POST", "coupons", { type: "percent", value: 10, status: "active", ...over }, "return=representation").then((r) => r[0]);
  created.coupons.push(row.id); return row;
};
const seedOrder = async (n: string) => {
  const row = await rest("POST", "orders", { order_number: `${TAG}-${n}`, email: `${TAG.toLowerCase()}${n}@t.test`, ship_full_name: "T", payment_status: "pending", status: "pending", subtotal: 1000, discount_amount: 100, total_amount: 1000 }, "return=representation").then((r) => r[0]);
  created.orders.push(row.id); return row.id;
};
const couponRow = (id: string) => rest("GET", `coupons?id=eq.${id}&select=used_count,status,value,type`).then((r) => r[0]);
const redemption = (orderId: string) => rest("GET", `coupon_redemptions?order_id=eq.${orderId}&select=state,discount_paise,used_count:coupon_id`).then((r) => r);

let svc: typeof import("@/services/couponRedemptionService");
let admin: typeof import("@/services/couponAdminService");

beforeAll(async () => {
  if (!RUN) return;
  svc = await import("@/services/couponRedemptionService");
  admin = await import("@/services/couponAdminService");
});
afterAll(async () => {
  if (!RUN) return;
  if (created.orders.length) { await rest("DELETE", `coupon_redemptions?order_id=in.(${created.orders.join(",")})`); await rest("DELETE", `orders?id=in.(${created.orders.join(",")})`); }
  if (created.coupons.length) { await rest("DELETE", `audit_events?entity_id=in.(${created.coupons.join(",")})`); await rest("DELETE", `coupon_redemptions?coupon_id=in.(${created.coupons.join(",")})`); await rest("DELETE", `coupons?id=in.(${created.coupons.join(",")})`); }
});

d("Phase 4 · redemption limits (real RPCs)", () => {
  it("global usage limit — the final slot is exclusive; the next attempt is 'exhausted'", async () => {
    const c = await seedCoupon({ code: `${TAG}GLOBAL`, max_uses: 1 });
    const [oA, oB] = [await seedOrder("g1"), await seedOrder("g2")];
    const a = await svc.reserveCoupon({ orderId: oA, code: c.code, identity: `${TAG}:x`, benefitPaise: 10000 });
    const b = await svc.reserveCoupon({ orderId: oB, code: c.code, identity: `${TAG}:y`, benefitPaise: 10000 });
    expect(a.reserved).toBe(true);
    expect(b.reserved).toBe(false);
    expect(b.reason).toBe("exhausted");
    expect((await couponRow(c.id)).used_count).toBe(1);
  });

  it("per-customer limit — same identity can't exceed max_uses_per_user", async () => {
    const c = await seedCoupon({ code: `${TAG}PERUSER`, max_uses: 10, max_uses_per_user: 1 });
    const [oA, oB] = [await seedOrder("p1"), await seedOrder("p2")];
    const a = await svc.reserveCoupon({ orderId: oA, code: c.code, identity: `${TAG}:same`, benefitPaise: 10000 });
    const b = await svc.reserveCoupon({ orderId: oB, code: c.code, identity: `${TAG}:same`, benefitPaise: 10000 });
    expect(a.reserved).toBe(true);
    expect(b.reserved).toBe(false);
    expect(b.reason).toBe("per_user");
  });

  it("concurrent final redemption — two simultaneous reserves on the last slot: exactly one wins", async () => {
    const c = await seedCoupon({ code: `${TAG}RACE`, max_uses: 1 });
    const [oA, oB] = [await seedOrder("r1"), await seedOrder("r2")];
    const [a, b] = await Promise.all([
      svc.reserveCoupon({ orderId: oA, code: c.code, identity: `${TAG}:ra`, benefitPaise: 10000 }),
      svc.reserveCoupon({ orderId: oB, code: c.code, identity: `${TAG}:rb`, benefitPaise: 10000 }),
    ]);
    expect([a.reserved, b.reserved].filter(Boolean).length).toBe(1); // row lock decides the winner
    expect((await couponRow(c.id)).used_count).toBe(1);
  });
});

d("Phase 4 · redemption lifecycle & idempotency (real RPCs)", () => {
  it("failed payment / cancel — release frees the slot (used_count back to 0, state released)", async () => {
    const c = await seedCoupon({ code: `${TAG}REL`, max_uses: 5 });
    const o = await seedOrder("rel");
    await svc.reserveCoupon({ orderId: o, code: c.code, identity: `${TAG}:rel`, benefitPaise: 10000 });
    expect((await couponRow(c.id)).used_count).toBe(1);
    await svc.releaseCoupon(o, "payment failed");
    expect((await couponRow(c.id)).used_count).toBe(0);
    expect((await redemption(o))[0].state).toBe("released");
  });

  it("payment retry / webhook replay — consume is idempotent (never double-consumes)", async () => {
    const c = await seedCoupon({ code: `${TAG}IDEM`, max_uses: 5 });
    const o = await seedOrder("idem");
    await svc.reserveCoupon({ orderId: o, code: c.code, identity: `${TAG}:idem`, benefitPaise: 10000 });
    await svc.consumeCoupon(o); // payment success
    await svc.consumeCoupon(o); // retry
    await svc.consumeCoupon(o); // webhook replay
    const rows = await redemption(o);
    expect(rows.length).toBe(1); // one row per (order, coupon)
    expect(rows[0].state).toBe("consumed");
    expect((await couponRow(c.id)).used_count).toBe(1); // still exactly one slot held
  });

  it("full/partial refund RETAINS the redemption (unlike a cancel, which releases)", async () => {
    const c = await seedCoupon({ code: `${TAG}REFUND`, max_uses: 5 });
    const refunded = await seedOrder("refunded");
    const cancelled = await seedOrder("cancelled");
    // A refunded order: reserve → consume, then a refund does NOT touch the ledger.
    await svc.reserveCoupon({ orderId: refunded, code: c.code, identity: `${TAG}:rf`, benefitPaise: 10000 });
    await svc.consumeCoupon(refunded);
    await rest("PATCH", `orders?id=eq.${refunded}`, { payment_status: "refunded", refund_amount: 1000 }); // refund = no release call
    expect((await redemption(refunded))[0].state).toBe("consumed"); // retained
    // A cancelled order: reserve → consume → release.
    await svc.reserveCoupon({ orderId: cancelled, code: c.code, identity: `${TAG}:cx`, benefitPaise: 10000 });
    await svc.consumeCoupon(cancelled);
    await svc.releaseCoupon(cancelled, "cancelled");
    expect((await redemption(cancelled))[0].state).toBe("released");
    expect((await couponRow(c.id)).used_count).toBe(1); // refunded still held; cancelled freed
  });
});

d("Phase 4 · admin service (duplicate / archive / audit / snapshot)", () => {
  it("duplicate code — a second coupon with the same code is rejected", async () => {
    const code = `${TAG}DUPCODE`;
    const first = await admin.createCoupon({ code, type: "percent", value: 10, status: "active" });
    expect(first.ok).toBe(true);
    // Track the created row for cleanup (fetch its id).
    const idRow = await rest("GET", `coupons?code=eq.${code}&select=id`);
    if (idRow[0]) created.coupons.push(idRow[0].id);
    const dup = await admin.createCoupon({ code, type: "percent", value: 20, status: "active" });
    expect(dup.ok).toBe(false);
    expect(String((dup as { reason?: string }).reason)).toMatch(/exist/i);
  });

  it("duplicate coupon — copies config into a NEW draft with no operational history", async () => {
    const src = await seedCoupon({ code: `${TAG}DUPSRC`, value: 15, max_uses: 5, used_count: 3, internal_notes: "src note" });
    const newCode = `${TAG}DUPNEW`;
    const res = await admin.duplicateCoupon(src.id, newCode);
    expect(res.ok).toBe(true);
    const dupId = (res as { id: string }).id;
    created.coupons.push(dupId);
    const dup = await rest("GET", `coupons?id=eq.${dupId}&select=status,value,used_count,internal_notes`).then((r) => r[0]);
    expect(dup.status).toBe("draft");         // forced to draft
    expect(dup.value).toBe(15);               // config copied
    expect(dup.internal_notes).toBe("src note");
    expect(dup.used_count).toBe(0);           // NO operational state carried over
    expect((await admin.listCouponAudit(dupId)).filter((e) => e.event !== "coupon.duplicated").length).toBe(0); // no source history
  });

  it("archive behaviour — a coupon with history can be archived but NOT hard-deleted", async () => {
    const c = await seedCoupon({ code: `${TAG}ARCH`, status: "active" });
    const o = await seedOrder("arch");
    await svc.reserveCoupon({ orderId: o, code: c.code, identity: `${TAG}:arch`, benefitPaise: 10000 }); // gives it history
    const archived = await admin.setCouponStatus(c.id, "archived");
    expect(archived.ok).toBe(true);
    expect((await couponRow(c.id)).status).toBe("archived");
    const del = await admin.deleteCoupon(c.id);
    expect(del.ok).toBe(false); // guarded — has redemptions
    expect(String((del as { reason?: string }).reason)).toMatch(/archive/i);
  });

  it("audit events — create + update are recorded with structured before/after changes", async () => {
    const code = `${TAG}AUDIT`;
    const r = await admin.createCoupon({ code, type: "percent", value: 10, status: "active" });
    expect(r.ok).toBe(true);
    const id = (await rest("GET", `coupons?code=eq.${code}&select=id`))[0].id;
    created.coupons.push(id);
    await admin.updateCoupon(id, { code, type: "percent", value: 25, status: "active" });
    const audit = await admin.listCouponAudit(id);
    expect(audit.some((e) => e.event === "coupon.created")).toBe(true);
    const upd = audit.find((e) => e.event === "coupon.updated");
    expect(upd?.changes?.value).toEqual({ before: 10, after: 25 }); // structured before/after diff
  });

  it("historical integrity — editing a coupon does NOT rewrite past ledger/order snapshots", async () => {
    const c = await seedCoupon({ code: `${TAG}HIST`, value: 10 });
    const o = await seedOrder("hist");
    await svc.reserveCoupon({ orderId: o, code: c.code, identity: `${TAG}:hist`, benefitPaise: 12345 });
    await svc.consumeCoupon(o);
    const before = (await redemption(o))[0].discount_paise;
    const orderBefore = (await rest("GET", `orders?id=eq.${o}&select=discount_amount`))[0].discount_amount;
    // Change the coupon's percentage AFTER the redemption happened.
    await admin.updateCoupon(c.id, { code: c.code, type: "percent", value: 50, status: "active" });
    expect((await redemption(o))[0].discount_paise).toBe(before); // ledger snapshot unchanged (12345)
    expect((await rest("GET", `orders?id=eq.${o}&select=discount_amount`))[0].discount_amount).toBe(orderBefore); // order snapshot unchanged
  });
});
