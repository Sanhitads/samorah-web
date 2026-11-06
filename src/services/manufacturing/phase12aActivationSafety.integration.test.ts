import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 12A final acceptance — activation AUTHORISATION (Part 2) + EMPTY-variant cutover safety (Part 3).
 * Authority is NOT the actor_id field: it is the super-admin capability (service layer) + the service_role-only
 * EXECUTE grant + the absence of any HTTP route. These tests prove a non-super-admin is refused, and that an
 * anon JWT (even forging a super-admin actor_id) cannot execute the RPC at all. The empty-stock shortcut is
 * shown to refuse a variant with an unresolved obligation and to never permit untagged post-activation consumption.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const ANON = process.env.INV_TEST_ANON_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

import { setVariantTracking } from "@/services/manufacturing/activationService";
import { ForbiddenError, type StaffActor } from "@/services/manufacturing/actor";

const RUNK = "P12S" + Date.now().toString(36).slice(-4);
let superId = ""; let n = 0;

async function untrackedWithStock(qty: number): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${n++}`;
  const p = await ins("products", { name: `P12S ${t}`, slug: `p12s-${t}`.toLowerCase(), base_sku: `P12S-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `P12S-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", tracking_state: "untracked", is_active: false });
  if (qty > 0) await rpc("adjust_inventory", { p: { variant_id: v.id, mode: "set", qty, reason: "Physical count correction" } });
  return v.id;
}
async function paidOrder(variantId: string, qty: number) {
  const t = `${RUNK}-${n++}`; const roid = `rzp_${t}`;
  const o = await ins("orders", { order_number: `P12S-${t}`, email: "s@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid, ship_full_name: "S" });
  await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${t}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { orderId: o.id, finalize: () => rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${t}`, p_signature: "s", p_source: "test", p_amount_paise: null }) };
}

d("Phase 12A — activation authorisation + empty-cutover safety", () => {
  beforeAll(async () => { superId = (await sel("/users?select=id&limit=1"))[0].id; });

  // ───────── Part 2: authorisation ─────────
  it("a non-super-admin actor is REFUSED activation (capability gate, not actor_id)", async () => {
    const v = await untrackedWithStock(0);
    for (const role of ["admin", "manager", "editor", "customer"] as const) {
      await expect(setVariantTracking({ userId: superId, role }, v, "tracked")).rejects.toBeInstanceOf(ForbiddenError);
    }
    // Super-admin is accepted (empty variant).
    await expect(setVariantTracking({ userId: superId, role: "super_admin" }, v, "tracked")).resolves.toBeUndefined();
  });

  it("an anon JWT cannot EXECUTE activate_variant_tracking — even forging a super-admin actor_id", async () => {
    const v = await untrackedWithStock(0);
    const r = await fetch(rest(`/rpc/activate_variant_tracking`), { method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p: { variant_id: v, state: "tracked", actor_id: superId } }) });
    expect(r.status).toBeGreaterThanOrEqual(400);                       // grant is service_role-only → denied
    expect((await sel(`/variant_tracking_epochs?variant_id=eq.${v}&select=id`)).length).toBe(0); // nothing activated
  });

  // ───────── Part 3: empty-variant cutover ─────────
  it("empty variant WITH an unresolved exception is REFUSED the empty shortcut", async () => {
    const v = await untrackedWithStock(0);
    const o = await ins("orders", { order_number: `P12S-${RUNK}-${n++}`, email: "x@example.test", status: "confirmed", payment_status: "paid", total_amount: 100, razorpay_order_id: `rzp_x_${RUNK}${n}`, ship_full_name: "X" });
    await ins("order_inventory_exceptions", { order_id: o.id, variant_id: v, shortfall_qty: 1, state: "captured_unallocated" });
    await expect(setVariantTracking({ userId: superId, role: "super_admin" }, v, "tracked")).rejects.toThrow(/discrepancy|eligible|consistent|reconcil/i);
    expect((await sel(`/variants?id=eq.${v}&select=tracking_state`))[0].tracking_state).toBe("untracked");
  });

  it("empty variant (sold-out pre-epoch) + a leftover pending order activates, but never permits untagged consumption", async () => {
    const v = await untrackedWithStock(5);
    const paid = await paidOrder(v, 5); expect((await paid.finalize()).body.created).toBe(true); // pre-epoch sale → stock 0
    expect((await sel(`/variants?id=eq.${v}&select=stock`))[0].stock).toBe(0);
    const pending = await paidOrder(v, 1);                               // a leftover pending order/reservation
    // Empty shortcut activates (stock 0, no overlay, no open exception).
    await setVariantTracking({ userId: superId, role: "super_admin" }, v, "tracked");
    const eps = await sel(`/variant_tracking_epochs?variant_id=eq.${v}&select=epoch_at`);
    expect(eps.length).toBe(1);                                          // durable epoch
    // The pre-epoch paid sale is classified BEFORE the epoch (not misclassified).
    const saleMv = (await sel(`/inventory_movements?variant_ref=eq.${v}&movement_type=eq.sale&select=created_at`))[0];
    expect(new Date(saleMv.created_at).getTime()).toBeLessThan(new Date(eps[0].epoch_at).getTime());
    // The leftover pending order CANNOT finalise untagged: stock is 0 → the sale is refused (fail closed).
    const r = await pending.finalize();
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await sel(`/orders?id=eq.${pending.orderId}&select=status`))[0].status).toBe("pending"); // preserved
    expect((await sel(`/variants?id=eq.${v}&select=stock`))[0].stock).toBe(0);                        // no consumption
  });
});
