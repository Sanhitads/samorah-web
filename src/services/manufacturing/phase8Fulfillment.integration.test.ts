import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 8 — physical batch picking / packing / substitution / shipment traceability. LOCAL Supabase only;
 * disposable test-only TRACKED variants (is_active:false so they never enter the bundle pool). Verifies
 * entitlement enforcement, actual-batch confirmation, controlled substitution (intra-variant, aggregate
 * stock unchanged), shipment provenance + reverse traceability, packing QC, block rules, returns using
 * confirmed provenance, ledger conservation (drift 0), and authorisation.
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

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch, variantReconciliation } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { getOrderEntitlements, confirmPickBatch, confirmShipmentProvenance, recordPackingQc, orderShippedBatches, batchShippedOrders } from "@/services/manufacturing/fulfillmentProvenanceService";
import { receiveReturnGoods } from "@/services/returnReceivingService";
import { markShipmentDispatched } from "@/services/shipmentService";
import { ForbiddenError, type StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let superadmin: StaffActor, manager: StaffActor, editor: StaffActor, customer: StaffActor;
let actorId = "";
let n = 0;

async function makeVariant(): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0];
  const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = ("P8" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6);
  const p = await ins("products", { name: `P8 ${t}`, slug: `p8-${t}`, base_sku: `P8-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  const v = await ins("variants", { product_id: p.id, sku: `P8-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(superadmin, v.id, "tracked");
  return v.id;
}
async function releasedBatch(variantId: string, qty: number, date = "2026-12-10"): Promise<string> {
  const { batchId } = await createBatch(manager, { variantId, idempotencyKey: `P8B-${RUNK}-${Math.random()}`, manufacturingDate: date, plannedQty: qty, earliestReleaseDate: "2026-01-01" });
  await updateBatch(manager, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(manager, batchId); await toCuring(manager, batchId); await toQualityCheck(manager, batchId);
  await recordRoutineQc(editor, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(editor, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(manager, batchId);
  await releaseBatch(manager, { batchId, qty, idempotencyKey: `P8R-${RUNK}-${Math.random()}` });
  return batchId;
}
async function sale(variantId: string, qty: number) {
  const tag = `${RUNK}-${n++}`; const roid = `rzp_p8_${tag}`;
  const o = await ins("orders", { order_number: `P8-${tag}`, email: "t@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid });
  const oi = await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, orderItemId: oi.id, orderNumber: `P8-${tag}` };
}
const PASS = { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true };
const drift = async (v: string) => (await variantReconciliation(v)).overlay_ledger_drift;
const ent = async (orderId: string, itemId: string) => { const e = await getOrderEntitlements(orderId); return { blocked: e.order_blocked, reason: e.block_reason, item: (e.items || []).find((i: any) => i.order_item_id === itemId) }; };

d("Phase 8 — fulfilment provenance", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    superadmin = { userId: us[0].id, role: "super_admin" };
    manager = { userId: us[1]?.id ?? us[0].id, role: "manager" };
    editor = { userId: us[0].id, role: "editor" };
    customer = { userId: us[0].id, role: "customer" };
    actorId = us[0].id;
    await setReleaseEnabled(superadmin, true);
    await setAllocationEnabled(superadmin, true);
  });

  it("1. single-batch pick confirmed; entitlement + conservation hold", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 3);
    let e = await ent(s.orderId, s.orderItemId);
    expect(e.blocked).toBe(false); expect(e.item.ordered).toBe(3); expect(e.item.remaining_fulfillable).toBe(3);
    const r = await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 3 });
    expect(r.ok).toBe(true); expect(r.substitution).toBe(false); expect(r.pickedTotal).toBe(3);
    e = await ent(s.orderId, s.orderItemId);
    expect(e.item.picked_confirmed).toBe(3);
    expect(await drift(v)).toBe(0);
  });

  it("2. mixed-batch pick across the allocation split", async () => {
    const v = await makeVariant(); const b1 = await releasedBatch(v, 2, "2026-12-01"); const b2 = await releasedBatch(v, 2, "2026-12-20");
    const s = await sale(v, 4); // allocate FIFO: b1(2)+b2(2)
    expect((await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b1, qty: 2 })).substitution).toBe(false);
    expect((await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b2, qty: 2 })).substitution).toBe(false);
    expect((await ent(s.orderId, s.orderItemId)).item.picked_confirmed).toBe(4);
    expect(await drift(v)).toBe(0);
  });

  it("3-4. substitution: picking from a different eligible batch is audited; aggregate stock unchanged; conserved", async () => {
    const v = await makeVariant(); const b1 = await releasedBatch(v, 5, "2026-12-01"); const b3 = await releasedBatch(v, 5, "2026-12-25");
    const s = await sale(v, 2); // allocated to b1 (FIFO)
    const stock0 = (await sel(`/variants?id=eq.${v}&select=stock`))[0].stock;
    const r = await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b3, qty: 2, reason: "b1 shelf empty" });
    expect(r.ok).toBe(true); expect(r.substitution).toBe(true);
    expect((await sel(`/variants?id=eq.${v}&select=stock`))[0].stock).toBe(stock0); // variants.stock untouched
    const subs = await sel(`/batch_stock_entries?variant_id=eq.${v}&entry_type=in.(substitution_in,substitution_out)&select=qty`);
    expect(subs.reduce((a: number, x: any) => a + x.qty, 0)).toBe(0); // +2 to b1, -2 to b3 → net 0
    const pc = await sel(`/batch_pick_confirmations?order_item_id=eq.${s.orderItemId}&select=batch_id,is_substitution`);
    expect(pc[0].batch_id).toBe(b3); expect(pc[0].is_substitution).toBe(true);
    expect(await drift(v)).toBe(0); // movement-less substitution doesn't change the attribution drift
    void b1;
  });

  it("5. concurrent picks on one item never exceed entitlement (no over-pick / no double consume)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 3);
    const results = await Promise.allSettled([
      confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 }),
      confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect((await ent(s.orderId, s.orderItemId)).item.picked_confirmed).toBeLessThanOrEqual(3); // never over ordered
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(await drift(v)).toBe(0);
  });

  it("6-7. partial pick then over-pick is rejected by entitlement", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 3);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 }); // partial
    await expect(confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 })).rejects.toThrow(); // 2+2 > 3
    expect((await ent(s.orderId, s.orderItemId)).item.picked_confirmed).toBe(2);
  });

  it("11. picking from a recalled/held batch is blocked", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5);
    const s = await sale(v, 2);
    await patch(`/manufacturing_batches?id=eq.${b}`, { recall_state: "recalled" });
    await expect(confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 })).rejects.toThrow(/recall/i);
  });

  it("8. refunded (line-identifiable) quantity reduces remaining fulfillable", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 3);
    // a line-identified return/refund of 1 unit → remaining fulfillable drops to 2
    const rr = await ins("returns", { order_id: s.orderId, order_number: s.orderNumber, rma_number: `RMA-P8-${RUNK}-${n++}`, status: "refund", resolution: "refund_only" });
    await ins("return_items", { return_id: rr.id, order_item_id: s.orderItemId, variant_id: v, sku: "T", product_name: "T", quantity: 1, line_amount: 100, restock: false });
    expect((await ent(s.orderId, s.orderItemId)).item.remaining_fulfillable).toBe(2);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 });
    await expect(confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 })).rejects.toThrow(); // can't pick the refunded unit
    void b;
  });

  it("9-10. fully-refunded and open-exception orders are blocked from picking", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 2);
    await patch(`/orders?id=eq.${s.orderId}`, { payment_status: "refunded" });
    let e = await ent(s.orderId, s.orderItemId); expect(e.blocked).toBe(true); expect(e.reason).toBe("fully_refunded");
    await expect(confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 })).rejects.toThrow(/fully_refunded/);
    // open exception also blocks
    const v2 = await makeVariant(); const b2 = await releasedBatch(v2, 2);
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b2}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "x", actor_id: manager.userId } });
    const s2 = await sale(v2, 2); // stock 2 covers the sale; batch now ineligible → shortfall 2 → exception
    const e2 = await ent(s2.orderId, s2.orderItemId); expect(e2.blocked).toBe(true); expect(e2.reason).toBe("allocation_exception");
  });

  it("12. packing QC: all-pass records passed; any-fail records failed", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 1);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 });
    const pass = await recordPackingQc(editor, s.orderId, { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true });
    expect(pass.passed).toBe(true);
    const fail = await recordPackingQc(editor, s.orderId, { product_ok: true, variant_ok: true, batch_ok: false, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true });
    expect(fail.passed).toBe(false);
  });

  it("13-14-15. shipment provenance freeze is idempotent; reverse traceability resolves both directions", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 2);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 });
    await recordPackingQc(editor, s.orderId, PASS); // dispatch gate requires a current passing QC
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    const f1 = await confirmShipmentProvenance(editor, sh.id); expect(f1.frozenLines).toBe(1);
    const f2 = await confirmShipmentProvenance(editor, sh.id); expect(f2.alreadyFrozen).toBe(true); // duplicate shipment action is a no-op
    const byOrder = await orderShippedBatches(s.orderId); expect(byOrder[0].batch_id).toBe(b); expect(byOrder[0].qty).toBe(2);
    const byBatch = await batchShippedOrders(b); expect(byBatch.some((x: any) => x.order_id === s.orderId)).toBe(true);
  });

  it("16. a return after a SUBSTITUTED pick restocks to the ACTUAL (substituted) batch, not the original allocation", async () => {
    const v = await makeVariant(); const b1 = await releasedBatch(v, 5, "2026-12-01"); const b3 = await releasedBatch(v, 5, "2026-12-28");
    const s = await sale(v, 2); // allocated b1
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b3, qty: 2, reason: "substitute" }); // actual = b3
    await recordPackingQc(editor, s.orderId, PASS);
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await confirmShipmentProvenance(editor, sh.id);
    // customer returns 2 → should restock to b3 (actual provenance), since confirm_pick_batch re-pointed the allocation
    const rr = await ins("returns", { order_id: s.orderId, order_number: s.orderNumber, rma_number: `RMA-P8-${RUNK}-${n++}`, status: "received", resolution: "return_required" });
    await ins("return_items", { return_id: rr.id, order_item_id: s.orderItemId, variant_id: v, sku: "T", product_name: "T", quantity: 2, line_amount: 200, restock: true });
    const res = await receiveReturnGoods(rr.id, [{ variantId: v, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(2);
    const ov = await sel(`/batch_stock_entries?source_id=eq.${s.orderId}&entry_type=eq.return_restock&select=batch_id,qty`);
    expect(ov.length).toBe(1); expect(ov[0].batch_id).toBe(b3); // actual batch, not b1
    expect(await drift(v)).toBe(0);
    void b1;
  });

  it("19. authorisation: a role without manufacturing.operate cannot confirm a pick", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 1);
    await expect(confirmPickBatch(customer, { orderItemId: s.orderItemId, batchId: b, qty: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("C1. the ORIGINAL payment-time allocation is never mutated by a substitution (immutable history)", async () => {
    const v = await makeVariant(); const b1 = await releasedBatch(v, 5, "2026-12-01"); const b3 = await releasedBatch(v, 5, "2026-12-29");
    const s = await sale(v, 2); // allocated b1
    const allocBefore = await sel(`/batch_allocations?order_item_id=eq.${s.orderItemId}&select=batch_id,qty,state&order=batch_id`);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b3, qty: 2, reason: "shelf" });
    const allocAfter = await sel(`/batch_allocations?order_item_id=eq.${s.orderItemId}&select=batch_id,qty,state&order=batch_id`);
    expect(allocAfter).toEqual(allocBefore); // UNCHANGED — original allocation preserved
    expect(allocBefore[0].batch_id).toBe(b1);
    const pc = (await sel(`/batch_pick_confirmations?order_item_id=eq.${s.orderItemId}&select=batch_id,allocated_batch_id,is_substitution,reason,confirmed_by,confirmed_at`))[0];
    expect(pc.batch_id).toBe(b3); expect(pc.allocated_batch_id).toBe(b1); expect(pc.is_substitution).toBe(true);
    expect(pc.reason).toBe("shelf"); expect(pc.confirmed_by).toBe(actorId); expect(pc.confirmed_at).toBeTruthy();
  });

  it("C2. partial substitution of a multi-unit line: one unit from the allocated batch, one substituted", async () => {
    const v = await makeVariant(); const b1 = await releasedBatch(v, 3, "2026-12-01"); const b3 = await releasedBatch(v, 3, "2026-12-29");
    const s = await sale(v, 2); // both allocated to b1 (FIFO, b1 has 3)
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b1, qty: 1 });  // not substitution
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b3, qty: 1, reason: "ran out" }); // substitution
    const pcs = await sel(`/batch_pick_confirmations?order_item_id=eq.${s.orderItemId}&select=batch_id,is_substitution,qty&order=confirmed_at`);
    expect(pcs.find((p: any) => p.batch_id === b1).is_substitution).toBe(false);
    expect(pcs.find((p: any) => p.batch_id === b3).is_substitution).toBe(true);
    expect(await drift(v)).toBe(0);
    // original allocation (b1) still intact
    expect((await sel(`/batch_allocations?order_item_id=eq.${s.orderItemId}&batch_id=eq.${b1}&select=qty`))[0].qty).toBe(2);
  });

  it("C7. changing a pick after packing QC supersedes the QC → dispatch blocked until re-QC", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 2);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 });
    await recordPackingQc(editor, s.orderId, PASS);           // QC against 1 picked
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 }); // pick changes → QC stale
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await expect(confirmShipmentProvenance(editor, sh.id)).rejects.toThrow(/packing_qc_missing_or_stale/);
    await recordPackingQc(editor, s.orderId, PASS);           // re-QC against current picks
    expect((await confirmShipmentProvenance(editor, sh.id)).frozenLines).toBe(1);
  });

  it("C8-C9. dispatch blocked without full confirmation and without passing QC", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 2);
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await expect(confirmShipmentProvenance(editor, sh.id)).rejects.toThrow(/incomplete_pick_confirmation/); // nothing picked
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 });
    await expect(confirmShipmentProvenance(editor, sh.id)).rejects.toThrow(/packing_qc/); // picked but no QC
  });

  it("C10. a batch recalled AFTER picking but BEFORE dispatch blocks the shipment freeze", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 2);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 });
    await recordPackingQc(editor, s.orderId, PASS);
    await patch(`/manufacturing_batches?id=eq.${b}`, { recall_state: "recalled" }); // recall slips in
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await expect(confirmShipmentProvenance(editor, sh.id)).rejects.toThrow(/recall/i);
  });

  it("C13. multi-component bundle preserves per-component (per order-item) batch provenance", async () => {
    // The bundle model creates one order_item PER component; each confirms its own actual batch.
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const tag = `${RUNK}-${n++}`; const roid = `rzp_p8b_${tag}`;
    const o = await ins("orders", { order_number: `P8-${tag}`, email: "t@example.test", status: "pending", payment_status: "pending", total_amount: 200, razorpay_order_id: roid });
    const ca = await ins("order_items", { order_id: o.id, variant_id: v, product_name: "Comp A", sku: "A", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 1, line_subtotal: 100, line_total: 100, is_bundle: true, composition_id: "bundle-1" });
    const cb = await ins("order_items", { order_id: o.id, variant_id: v, product_name: "Comp B", sku: "B", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 1, line_subtotal: 100, line_total: 100, is_bundle: true, composition_id: "bundle-1" });
    await ins("stock_reservations", { variant_id: v, quantity: 2, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
    await confirmPickBatch(editor, { orderItemId: ca.id, batchId: b, qty: 1 });
    await confirmPickBatch(editor, { orderItemId: cb.id, batchId: b, qty: 1 });
    expect((await sel(`/batch_pick_confirmations?order_item_id=eq.${ca.id}&select=batch_id`))[0].batch_id).toBe(b);
    expect((await sel(`/batch_pick_confirmations?order_item_id=eq.${cb.id}&select=batch_id`))[0].batch_id).toBe(b);
    expect(await drift(v)).toBe(0);
  });

  it("C17. physical write-off cannot consume more than the batch currently holds (conservation)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 2); // b holds the 2 units; made ineligible below
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "x", actor_id: manager.userId } });
    const s = await sale(v, 2); // shortfall 2 (b ineligible); b on-hand still 2 (sale unattributed)
    const e = (await sel(`/order_inventory_exceptions?order_id=eq.${s.orderId}&select=id`))[0];
    const refund = await ins("refunds", { order_id: s.orderId, amount: 200, status: "processed", method: "manual" });
    await rpc("resolve_exception_by_refund", { p: { exception_id: e.id, refund_id: refund.id, actor_id: actorId } });
    const b2 = await releasedBatch(v, 1); // on-hand 1 < shortfall 2 → disposing the shortfall to it is REJECTED
    const bad = await rpc("dispose_exception_shortfall", { p: { exception_id: e.id, batch_id: b2, actor_id: actorId } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const ok = await rpc("dispose_exception_shortfall", { p: { exception_id: e.id, batch_id: b, actor_id: actorId } }); // b holds 2 → OK
    expect(ok.body.ok).toBe(true);
    expect((await variantReconciliation(v)).physical_consistent).toBe(true);
    void b2;
  });

  it("A1. the pick fingerprint is collision-resistant and changes when a pick changes", async () => {
    const vX = await makeVariant(); const bA = await releasedBatch(vX, 5); const sX = await sale(vX, 3);
    await confirmPickBatch(editor, { orderItemId: sX.orderItemId, batchId: bA, qty: 2 });
    const fpX2 = (await rpc("order_pick_fingerprint", { p_order_id: sX.orderId })).body; // 1 record (bA,2)
    await confirmPickBatch(editor, { orderItemId: sX.orderItemId, batchId: bA, qty: 1 });
    const fpX3 = (await rpc("order_pick_fingerprint", { p_order_id: sX.orderId })).body; // 2 records → MUST differ
    expect(fpX3).not.toBe(fpX2); // a changed pick set supersedes any earlier QC
    const vY = await makeVariant(); const bC = await releasedBatch(vY, 5); const sY = await sale(vY, 2);
    await confirmPickBatch(editor, { orderItemId: sY.orderItemId, batchId: bC, qty: 2 }); // same count(1)/sum(2) as fpX2, different batch
    const fpY = (await rpc("order_pick_fingerprint", { p_order_id: sY.orderId })).body;
    expect(fpY).not.toBe(fpX2); // different batch set with equal count/sum → different fingerprint (no collision)
    expect(fpX2).toMatch(/^[0-9a-f]{64}$/); // SHA-256 digest
  });

  it("A2. a batch recalled AFTER shipment freeze blocks the final carrier dispatch (markShipmentDispatched)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5); const s = await sale(v, 2);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 2 });
    await recordPackingQc(editor, s.orderId, PASS);
    const sh = await ins("shipments", { order_id: s.orderId, status: "courier_assigned", provider: "manual" });
    expect((await confirmShipmentProvenance(editor, sh.id)).frozenLines).toBe(1); // provenance frozen while eligible
    await patch(`/manufacturing_batches?id=eq.${b}`, { recall_state: "recalled" }); // recall slips in AFTER freeze
    expect((await rpc("assert_shipment_dispatchable", { p_shipment_id: sh.id })).body.reason).toBe("batch_recalled_or_held");
    const disp = await markShipmentDispatched(s.orderId, { actorId });
    expect(disp.ok).toBe(false); expect(disp.reason).toMatch(/dispatch_blocked:batch_recalled_or_held/);
  });

  it("A3. quantity semantics: shipped not double-counted; repeated shipment freeze adds no provenance; refund can't over-fulfill", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10); const s = await sale(v, 3);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 3 });
    await recordPackingQc(editor, s.orderId, PASS);
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await confirmShipmentProvenance(editor, sh.id);
    await confirmShipmentProvenance(editor, sh.id); // repeated → idempotent, no duplicate lines
    const lines = await sel(`/shipment_batch_lines?shipment_id=eq.${sh.id}&select=qty`);
    expect(lines.reduce((a: number, x: any) => a + x.qty, 0)).toBe(3); // not 6
    const e = await ent(s.orderId, s.orderItemId);
    expect(e.item.shipped).toBe(3); expect(e.item.remaining_to_pick).toBe(0); expect(e.item.remaining_to_ship).toBe(0);
    expect(e.item.remaining_fulfillable).toBe(0); // fully shipped → nothing more fulfillable
  });
});
