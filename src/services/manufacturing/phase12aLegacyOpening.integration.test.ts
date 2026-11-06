import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 12A — legacy opening-stock cutover + activation guard (service path; disposable fixtures).
 * CORRECTED invariant (data-integrity fix): variants.stock is the authoritative SELLABLE balance, which must
 * equal the verified ELIGIBLE quantity; quarantine + unknown are held aside (sign-off only) and are NEVER in
 * variants.stock, availability, reservations or the sellable overlay. Worked example: 35 physical / 30 eligible
 * / 3 quarantine / 2 unknown — the 5 non-sellable units can never be offered (reserve_stock caps at 30).
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const patch = (p: string, row: any) => fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(row) });
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { variantReconciliation } from "@/services/manufacturing/releaseService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = "P12A" + Date.now().toString(36).slice(-4);
let sup: StaffActor; let n = 0;

async function untrackedWithStock(qty: number, active = false): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${n++}`;
  const p = await ins("products", { name: `P12A ${t}`, slug: `p12a-${t}`.toLowerCase(), base_sku: `P12A-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: ("PA" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `P12A-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", tracking_state: "untracked", is_active: active });
  await rpc("adjust_inventory", { p: { variant_id: v.id, mode: "set", qty, reason: "Physical count correction" } });
  return v.id;
}
async function seedPaidPending(variantId: string, qty: number) {
  const t = `${RUNK}-${n++}`; const roid = `rzp_${t}`;
  const o = await ins("orders", { order_number: `P12A-${t}`, email: "l@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid, ship_full_name: "L" });
  await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${t}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { orderId: o.id, finalize: () => rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${t}`, p_signature: "s", p_source: "test", p_amount_paise: null }) };
}
async function conserve(v: string) {
  const mv = await sel(`/inventory_movements?variant_ref=eq.${v}&select=quantity_delta`);
  const ledger = mv.reduce((a: number, m: any) => a + m.quantity_delta, 0);
  const ov = await sel(`/batch_stock_entries?variant_id=eq.${v}&select=qty`);
  const overlay = ov.reduce((a: number, e: any) => a + e.qty, 0);
  const vr = (await sel(`/variants?id=eq.${v}&select=stock`))[0];
  return { aggregate: vr.stock, ledger, overlay, aggregateEqLedger: vr.stock === ledger, physicalConsistent: vr.stock === overlay };
}
const legacyOnhand = async (v: string) => {
  const b = (await sel(`/manufacturing_batches?variant_id=eq.${v}&batch_kind=eq.legacy&select=id`))[0];
  return b ? (await sel(`/batch_stock_entries?batch_id=eq.${b.id}&select=qty`)).reduce((a: number, e: any) => a + e.qty, 0) : 0;
};
const reserve = (v: string, qty: number, sku = "T") => rpc("reserve_stock", { p: { session_id: `sess-${v}-${Math.random()}`, items: [{ variant_id: v, quantity: qty, sku }] } });

d("Phase 12A — legacy opening (sellable invariant) + activation guard", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=1");
    sup = { userId: us[0].id, role: "super_admin" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });
  afterAll(async () => { if (RUN) { await setReleaseEnabled(sup, false); await setAllocationEnabled(sup, false); } });

  it("eligible MUST equal variants.stock (sellable); quarantine/unknown are held aside, not stock", async () => {
    const v = await untrackedWithStock(30);
    // eligible (25) ≠ variants.stock (30) → rejected: stock is the sellable balance.
    const bad = await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 25, quarantine_qty: 3, unknown_qty: 2, actor_id: sup.userId } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect((await sel(`/variant_legacy_reconciliation?variant_id=eq.${v}&select=state`)).length).toBe(0);
    // eligible (30) == variants.stock (30), with 3 quarantine + 2 unknown HELD ASIDE → accepted.
    const ok = await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 30, quarantine_qty: 3, unknown_qty: 2, actor_id: sup.userId } });
    expect(ok.body.ok).toBe(true); expect(ok.body.sellable).toBe(30);
    const signoff = (await sel(`/variant_legacy_reconciliation?variant_id=eq.${v}&select=verified_eligible_qty,quarantine_qty,unknown_qty,state`))[0];
    expect([signoff.verified_eligible_qty, signoff.quarantine_qty, signoff.unknown_qty, signoff.state]).toEqual([30, 3, 2, "reconciled"]);
    // The 5 non-sellable are NOT in variants.stock nor in the sellable overlay.
    expect((await sel(`/variants?id=eq.${v}&select=stock`))[0].stock).toBe(30);
    expect(await legacyOnhand(v)).toBe(30);
  });

  it("WORKED EXAMPLE 35/30/3/2: the 5 non-sellable units can NEVER be offered or reserved", async () => {
    const v = await untrackedWithStock(30, true);                          // 30 SELLABLE (active, reservable)
    await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 30, quarantine_qty: 3, unknown_qty: 2, actor_id: sup.userId } });
    // Availability caps at the 30 sellable — the held 5 are invisible to reserve_stock.
    expect((await reserve(v, 30)).body.ok).toBe(true);                     // 30 reservable
    expect((await reserve(v, 1)).body.reason).toBe("insufficient_stock");  // the 31st (a held unit) is refused
    await fetch(rest(`/stock_reservations?variant_id=eq.${v}`), { method: "DELETE", headers: H }); // release holds
    // Activate (guard passes: physical_consistent 30==30, eligible).
    await setVariantTracking(sup, v, "tracked");
    const rec = await variantReconciliation(v);
    expect(rec.physical_consistent).toBe(true); expect(rec.activation_eligible).toBe(true);
    const c = await conserve(v); expect(c.aggregate).toBe(30); expect(c.physicalConsistent).toBe(true);
    await patch(`/variants?id=eq.${v}`, { is_active: false });             // keep the disposable fixture out of the storefront
  });

  it("post-activation sale attributes to legacy; held units never consumed; conservation holds", async () => {
    const v = await untrackedWithStock(30, true);
    await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 30, quarantine_qty: 3, unknown_qty: 2, actor_id: sup.userId } });
    await setVariantTracking(sup, v, "tracked");
    const s = await seedPaidPending(v, 30); expect((await s.finalize()).body.created).toBe(true);
    expect(await legacyOnhand(v)).toBe(0);
    expect((await variantReconciliation(v)).fully_reconciled).toBe(true);
    // Stock is 0 — the held 5 never became sellable; a further reservation is refused.
    expect((await reserve(v, 1)).body.reason).toBe("insufficient_stock");
    const c = await conserve(v); expect(c.aggregate).toBe(0); expect(c.physicalConsistent).toBe(true);
    await patch(`/variants?id=eq.${v}`, { is_active: false });
  });

  it("a PRE-EXISTING pending order (reserved before cutover) finalises post-epoch and attributes to legacy", async () => {
    const v = await untrackedWithStock(12);
    const pre = await seedPaidPending(v, 5);                               // reserved BEFORE the cutover (against the 12 sellable)
    await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 12, quarantine_qty: 0, unknown_qty: 0, actor_id: sup.userId } });
    await setVariantTracking(sup, v, "tracked");
    expect((await pre.finalize()).body.created).toBe(true);               // finalises post-epoch → attributes
    expect(await legacyOnhand(v)).toBe(7);                                 // 12 − 5
    const c = await conserve(v); expect(c.aggregate).toBe(7); expect(c.physicalConsistent).toBe(true);
  });
});
