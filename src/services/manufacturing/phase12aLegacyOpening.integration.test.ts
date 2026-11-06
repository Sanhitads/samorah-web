import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 12A — legacy opening-stock cutover + activation guard (service path; disposable fixtures).
 * Proves: classification must equal variants.stock (invent nothing); the opening seeds typed legacy/
 * quarantine containers with movement-less overlay (no new ledger); the DB activation guard then passes;
 * post-activation sales attribute to the ELIGIBLE legacy batch only (quarantine + unknown are never sold);
 * pre-existing pending orders attribute after the epoch; conservation holds (verified from the RAW ledger).
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
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { variantReconciliation } from "@/services/manufacturing/releaseService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = "P12A" + Date.now().toString(36).slice(-4);
let sup: StaffActor; let n = 0;

async function untrackedWithStock(qty: number): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${n++}`;
  const p = await ins("products", { name: `P12A ${t}`, slug: `p12a-${t}`.toLowerCase(), base_sku: `P12A-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: ("PA" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `P12A-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", tracking_state: "untracked", is_active: false });
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
  return { aggregate: vr.stock, ledger, overlay, aggregateEqLedger: vr.stock === ledger, physicalConsistent: vr.stock === overlay, nonNegative: vr.stock >= 0 };
}
const onhand = async (v: string, kind: string) => {
  const bs = await sel(`/manufacturing_batches?variant_id=eq.${v}&batch_kind=eq.${kind}&select=id,batch_code`);
  let total = 0; for (const b of bs) total += (await sel(`/batch_stock_entries?batch_id=eq.${b.id}&select=qty`)).reduce((a: number, e: any) => a + e.qty, 0);
  return total;
};

d("Phase 12A — legacy opening + activation guard", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=1");
    sup = { userId: us[0].id, role: "super_admin" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });
  afterAll(async () => { if (RUN) { await setReleaseEnabled(sup, false); await setAllocationEnabled(sup, false); } });

  it("classification MUST equal variants.stock — invents nothing", async () => {
    const v = await untrackedWithStock(20);
    const bad = await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 10, quarantine_qty: 4, unknown_qty: 2, actor_id: sup.userId } });
    expect(bad.status).toBeGreaterThanOrEqual(400);                       // 16 ≠ 20 → rejected
    expect((await sel(`/variant_legacy_reconciliation?variant_id=eq.${v}&select=state`)).length).toBe(0);
  });

  it("opening cutover → activation guard passes → conservation holds (verified from raw ledger)", async () => {
    const v = await untrackedWithStock(20);
    const r = await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 14, quarantine_qty: 4, unknown_qty: 2, actor_id: sup.userId } });
    expect(r.body.ok).toBe(true);
    // Reconciliation is now consistent and activation-eligible.
    const rec = await variantReconciliation(v);
    expect(rec.overlay_ledger_drift).toBe(0);
    expect(rec.physical_consistent).toBe(true);
    expect(rec.activation_eligible).toBe(true);
    // The DB guard now permits activation (it was refused before the cutover).
    await setVariantTracking(sup, v, "tracked");
    expect((await sel(`/variant_tracking_epochs?variant_id=eq.${v}&select=id`)).length).toBe(1);
    // Containers: eligible → legacy (sellable); quarantine + unknown → quarantine (held).
    expect(await onhand(v, "legacy")).toBe(14);
    expect(await onhand(v, "quarantine")).toBe(6);                        // 4 quarantine + 2 unknown
    const c = await conserve(v);
    expect(c.aggregate).toBe(20); expect(c.aggregateEqLedger).toBe(true); expect(c.physicalConsistent).toBe(true);
  });

  it("post-activation sales attribute to ELIGIBLE legacy only; quarantine + unknown are never sold", async () => {
    const v = await untrackedWithStock(20);
    await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 14, quarantine_qty: 4, unknown_qty: 2, actor_id: sup.userId } });
    await setVariantTracking(sup, v, "tracked");
    // Sell 10 → all from legacy; drift 0.
    const s1 = await seedPaidPending(v, 10); expect((await s1.finalize()).body.created).toBe(true);
    expect(await onhand(v, "legacy")).toBe(4);
    expect((await variantReconciliation(v)).fully_reconciled).toBe(true);
    // Sell 6 more (>remaining eligible 4): 4 attributed, 2 shortfall exception — quarantine/unknown untouched.
    const s2 = await seedPaidPending(v, 6); expect((await s2.finalize()).body.created).toBe(true);
    expect(await onhand(v, "legacy")).toBe(0);
    expect(await onhand(v, "quarantine")).toBe(6);                        // held stock NEVER consumed
    const exc = await sel(`/order_inventory_exceptions?order_id=eq.${s2.orderId}&select=shortfall_qty`);
    expect(exc.length).toBe(1); expect(exc[0].shortfall_qty).toBe(2);
    // With an OPEN shortfall, aggregate is deducted fully but overlay attributes only the eligible units;
    // the gap IS the exception (not a loss): aggregate(4) == overlay(6) − shortfall(2), and it's explained.
    const c = await conserve(v);
    expect(c.aggregate).toBe(4); expect(c.aggregateEqLedger).toBe(true);
    expect(c.overlay).toBe(6);                         // legacy 0 + quarantine 6 (held, untouched)
    expect(c.overlay - 2).toBe(c.aggregate);           // overlay − open shortfall == aggregate
    expect((await variantReconciliation(v)).accounting_explained).toBe(true);
  });

  it("a PRE-EXISTING pending order finalises after the epoch and attributes to legacy", async () => {
    const v = await untrackedWithStock(12);
    const pre = await seedPaidPending(v, 5);                              // reserved BEFORE the cutover
    await rpc("reconcile_variant_opening", { p: { variant_id: v, eligible_qty: 12, quarantine_qty: 0, unknown_qty: 0, actor_id: sup.userId } });
    await setVariantTracking(sup, v, "tracked");
    expect((await pre.finalize()).body.created).toBe(true);              // finalises post-epoch → attributes
    expect(await onhand(v, "legacy")).toBe(7);                           // 12 − 5
    const c = await conserve(v);
    expect(c.aggregate).toBe(7); expect(c.aggregateEqLedger).toBe(true); expect(c.physicalConsistent).toBe(true);
  });
});
