import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 7B-2 (part 2) — batch-aware RETURNS, RTO & REFUND recovery. LOCAL Supabase only; disposable
 * test-only tracked variants (never touches live catalog tracking_state). Verifies: originating-batch
 * attribution from recorded provenance, eligible-only restock, recalled/held → quarantine/hold (never
 * sellable), unknown origin → hold (never invent a batch), partial/repeated/over-receipt, RTO + idempotent
 * duplicate commit, refund-evidence exception recovery (no positive movement), fulfilment blocking, the
 * A.1 backdate guard, untracked byte-identical regression, and overlay↔ledger reconciliation after each step.
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
import { getOrderExceptions, resolveExceptionByRefund, listReceiptHolds, disposeExceptionShortfall, resolveReceiptHold } from "@/services/manufacturing/exceptionService";
import { receiveReturnGoods } from "@/services/returnReceivingService";
import { receiveRtoGoods } from "@/services/rtoReceivingService";
import { advanceFulfillment } from "@/services/fulfillmentService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let superadmin: StaffActor, manager: StaffActor, inspector: StaffActor;
let actorId = "";
let saleN = 0;

async function makeVariant(tracked: boolean): Promise<{ productId: string; variantId: string }> {
  const cat = (await sel("/categories?select=id&limit=1"))[0];
  const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = ("T" + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 6);
  const p = await ins("products", { name: `RRT ${t}`, slug: `rrt-${t}`, base_sku: `RRT-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  // is_active:false keeps disposable fixtures OUT of the bundle candle pool (getBundleCandles filters
  // on is_active) so bundle tests stay deterministic regardless of accumulated test products.
  const v = await ins("variants", { product_id: p.id, sku: `RRT-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
  if (tracked) await setVariantTracking(superadmin, v.id, "tracked");
  return { productId: p.id, variantId: v.id };
}

/** Build + release a batch of `qty` for a variant. `date` lets a caller order FIFO across batches. */
async function releasedBatch(variantId: string, qty: number, date = "2026-12-10"): Promise<string> {
  const { batchId } = await createBatch(manager, { variantId, idempotencyKey: `RB-${RUNK}-${Math.random()}`, manufacturingDate: date, plannedQty: qty, earliestReleaseDate: "2026-01-01" });
  await updateBatch(manager, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(manager, batchId); await toCuring(manager, batchId); await toQualityCheck(manager, batchId);
  await recordRoutineQc(inspector, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(inspector, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(manager, batchId);
  await releaseBatch(manager, { batchId, qty, idempotencyKey: `RR-${RUNK}-${Math.random()}` });
  return batchId;
}

/** Finalise a single-variant order of `qty` → creates batch_allocations + sale overlays via finalize_order. */
async function sale(variantId: string, qty: number, productId?: string) {
  const tag = `${RUNK}-${saleN++}`;
  const roid = `rzp_${tag}`;
  const o = await ins("orders", { order_number: `RRT-${tag}`, email: "t@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid });
  const oi = await ins("order_items", { order_id: o.id, product_id: productId ?? null, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `sess-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  const r = await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, orderItemId: oi.id, orderNumber: `RRT-${tag}`, result: r.body };
}

async function makeReturn(orderId: string, orderNumber: string, variantId: string, qty: number) {
  const rma = `RMA-${RUNK}-${saleN++}`;
  const ret = await ins("returns", { order_id: orderId, order_number: orderNumber, rma_number: rma, status: "received", resolution: "return_required", reason: "changed_mind" });
  await ins("return_items", { return_id: ret.id, order_item_id: null, variant_id: variantId, sku: "T", product_name: "T", quantity: qty, line_amount: qty * 100, restock: true });
  return ret.id as string;
}

/** Produce a PAID order with an OPEN allocation shortfall: release a batch, revoke its design
 *  validation (ineligible at allocation), then sell — stock covers the sale but nothing attributes. */
async function shortfallOrder(variantId: string, releaseQty: number, saleQty: number) {
  const b = await releasedBatch(variantId, releaseQty);
  const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
  await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "test shortfall", actor_id: manager.userId } });
  const s = await sale(variantId, saleQty); // exception shortfall = saleQty (batch now ineligible)
  return { ...s, batchId: b };
}

const recon = async (v: string) => variantReconciliation(v);
const overlaysFor = async (orderId: string) => sel(`/batch_stock_entries?source_id=eq.${orderId}&entry_type=in.(return_restock,rto_restock)&select=batch_id,qty`);
const holdsFor = async (orderId: string) => sel(`/batch_receipt_holds?order_id=eq.${orderId}&select=qty,kind,state`);
const quarFor = async (batchId: string) => sel(`/batch_quarantine?batch_id=eq.${batchId}&select=qty,reason,disposition`);

d("Phase 7B-2 (part 2) — batch-aware returns / RTO / refund", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    superadmin = { userId: us[0].id, role: "super_admin" };
    manager = { userId: us[1]?.id ?? us[0].id, role: "manager" };
    inspector = { userId: us[0].id, role: "editor" };
    actorId = us[0].id;
    await setReleaseEnabled(superadmin, true);
    await setAllocationEnabled(superadmin, true);
  });

  it("1. single-batch return: eligible restockable units go back to the originating batch; reconciled", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 4);
    expect((await recon(variantId)).fully_reconciled).toBe(true);
    const stockBefore = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock; // 10 - 4 = 6
    const rId = await makeReturn(s.orderId, s.orderNumber, variantId, 2);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(2);
    const ov = await overlaysFor(s.orderId);
    expect(ov).toHaveLength(1); expect(ov[0].batch_id).toBe(b); expect(ov[0].qty).toBe(2);
    const stockAfter = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    expect(stockAfter).toBe(stockBefore + 2);
    const rr = await recon(variantId);
    expect(rr.overlay_ledger_drift).toBe(0); expect(rr.fully_reconciled).toBe(true);
    expect(await holdsFor(s.orderId)).toHaveLength(0);
  });

  it("2. damaged units never restock (receipt is the audit truth); only restockable moves", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 5);
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const rId = await makeReturn(s.orderId, s.orderNumber, variantId, 3);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 3, restockable: 1, damaged: 2 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(1);
    const after = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    expect(after).toBe(before + 1); // only the 1 restockable
    expect((await overlaysFor(s.orderId))[0].qty).toBe(1);
    expect((await recon(variantId)).fully_reconciled).toBe(true);
    expect(await holdsFor(s.orderId)).toHaveLength(0); // damaged is not a hold; it is receipt truth
    void b;
  });

  it("3. multi-batch all-eligible: restock attributed FIFO, capped per batch at shipped−returned", async () => {
    const { variantId } = await makeVariant(true);
    const b1 = await releasedBatch(variantId, 2, "2026-12-01"); // older → FIFO first
    const b2 = await releasedBatch(variantId, 2, "2026-12-20");
    const s = await sale(variantId, 4); // consumes b1(2) + b2(2)
    const rId = await makeReturn(s.orderId, s.orderNumber, variantId, 3);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 3, restockable: 3, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(3);
    const ov = await overlaysFor(s.orderId);
    const byBatch = Object.fromEntries(ov.map((e: any) => [e.batch_id, e.qty]));
    expect(byBatch[b1]).toBe(2); // older batch filled to its cap first
    expect(byBatch[b2]).toBe(1); // remainder
    expect((await recon(variantId)).fully_reconciled).toBe(true);
  });

  it("4. partial + repeated returns accumulate; cumulative restock cannot exceed fulfilled", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 5);
    const r1 = await makeReturn(s.orderId, s.orderNumber, variantId, 5); // whole order may come back
    expect((await receiveReturnGoods(r1, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId })).restocked).toBe(2);
    // second physical receipt on the SAME return (cumulative received 2+3 = 5 = fulfilled)
    expect((await receiveReturnGoods(r1, [{ variantId, received: 3, restockable: 3, damaged: 0 }], { actorId })).restocked).toBe(3);
    const ov = await overlaysFor(s.orderId);
    expect(ov.reduce((n: number, e: any) => n + e.qty, 0)).toBe(5);
    expect(ov.every((e: any) => e.batch_id === b)).toBe(true); // all back to the single originating batch
    // a THIRD receipt over the fulfilled quantity is rejected by the frozen over-receipt guard
    const over = await receiveReturnGoods(r1, [{ variantId, received: 1, restockable: 1, damaged: 0 }], { actorId });
    expect(over.ok).toBe(false);
    expect((await recon(variantId)).fully_reconciled).toBe(true);
  });

  it("5. recalled originating batch (single): restockable units go to QUARANTINE, never sellable", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 4);
    await patch(`/manufacturing_batches?id=eq.${b}`, { recall_state: "recalled" });
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const rId = await makeReturn(s.orderId, s.orderNumber, variantId, 2);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(0); // nothing sellable
    const after = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    expect(after).toBe(before); // sellable stock unchanged
    const q = await quarFor(b);
    expect(q.reduce((n: number, x: any) => n + x.qty, 0)).toBe(2);
    expect((await recon(variantId)).fully_reconciled).toBe(true);
  });

  it("6. multi-batch incl. a recalled one: ambiguous → HOLD all (fail-safe), nothing sellable", async () => {
    const { variantId } = await makeVariant(true);
    const b1 = await releasedBatch(variantId, 2, "2026-12-01");
    const b2 = await releasedBatch(variantId, 2, "2026-12-20");
    const s = await sale(variantId, 4);
    await patch(`/manufacturing_batches?id=eq.${b2}`, { recall_state: "on_hold" });
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const rId = await makeReturn(s.orderId, s.orderNumber, variantId, 2);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(0);
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(before);
    const holds = await holdsFor(s.orderId);
    expect(holds.reduce((n: number, h: any) => n + h.qty, 0)).toBe(2);
    expect(holds[0].kind).toBe("recall_ambiguous");
    void b1;
  });

  it("7. unknown origin (no recorded provenance): HOLD, never invent a batch", async () => {
    const { variantId, productId } = await makeVariant(true);
    await releasedBatch(variantId, 10);
    // An order WITHOUT allocations for this variant: insert directly (no finalize_order allocation).
    const tag = `${RUNK}-${saleN++}`;
    const o = await ins("orders", { order_number: `RRT-${tag}`, email: "t@example.test", status: "shipped", payment_status: "paid", total_amount: 200 });
    await ins("order_items", { order_id: o.id, product_id: productId, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 2, line_subtotal: 200, line_total: 200 });
    const rId = await makeReturn(o.id, `RRT-${tag}`, variantId, 2);
    const res = await receiveReturnGoods(rId, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(0);
    const holds = await holdsFor(o.id);
    expect(holds.reduce((n: number, h: any) => n + h.qty, 0)).toBe(2);
    expect(holds[0].kind).toBe("unknown_origin");
  });

  it("8. RTO: full + partial + idempotent duplicate commit; restock to originating batch", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 4);
    const sh = await ins("shipments", { order_id: s.orderId, status: "rto", provider: "manual" });
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    // partial RTO receipt: 3 of 4, 1 damaged
    const r1 = await receiveRtoGoods(sh.id, [{ variantId, received: 3, restockable: 2, damaged: 1 }], { actorId });
    expect(r1.ok).toBe(true); expect(r1.restocked).toBe(2);
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(before + 2);
    // a second receipt for the remaining 1 (cumulative received 3+1 = 4 = shipped)
    const r2 = await receiveRtoGoods(sh.id, [{ variantId, received: 1, restockable: 1, damaged: 0 }], { actorId });
    expect(r2.ok).toBe(true); expect(r2.restocked).toBe(1);
    const totalOv = (await overlaysFor(s.orderId)).reduce((n: number, e: any) => n + e.qty, 0);
    expect(totalOv).toBe(3); // 2 + 1 restocked to batch b
    expect((await recon(variantId)).fully_reconciled).toBe(true);
    void b;
  });

  it("9. RTO over-shipment receipt is rejected; held/recalled RTO units never sellable", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s = await sale(variantId, 2);
    const sh = await ins("shipments", { order_id: s.orderId, status: "rto", provider: "manual" });
    // over-ship receipt (3 > shipped 2) rejected by the frozen over-receipt guard
    const over = await receiveRtoGoods(sh.id, [{ variantId, received: 3, restockable: 3, damaged: 0 }], { actorId });
    expect(over.ok).toBe(false);
    // recall the batch, then RTO → quarantine, nothing sellable
    await patch(`/manufacturing_batches?id=eq.${b}`, { recall_state: "recalled" });
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const r = await receiveRtoGoods(sh.id, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId });
    expect(r.ok).toBe(true); expect(r.restocked).toBe(0);
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(before);
    expect((await quarFor(b)).reduce((n: number, x: any) => n + x.qty, 0)).toBe(2);
  });

  it("10. shortfall IS aggregate-deducted; refund is financial-only (no positive movement); drift stays EXPLAINED; physical writeoff then reconciles", async () => {
    const { variantId } = await makeVariant(true);
    const stock0 = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock; // 0
    const s = await shortfallOrder(variantId, 5, 3); // release 5 (stock→5), revoke, sell 3 (stock→2); shortfall 3
    // ROOT CAUSE: the shortfall WAS deducted from aggregate variants.stock.
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(stock0 + 5 - 3);
    const exc = await getOrderExceptions(s.orderId);
    expect(exc).toHaveLength(1); expect(exc[0].shortfall_qty).toBe(3);
    let r = await recon(variantId);
    expect(r.overlay_ledger_drift).toBe(3); expect(r.open_exception_qty).toBe(3);
    expect(r.accounting_explained).toBe(true); expect(r.fully_reconciled).toBe(false);

    // Financial refund: NO positive inventory movement; drift persists but stays EXPLAINED (not "unexplained").
    const movesBefore = (await sel(`/inventory_movements?variant_ref=eq.${variantId}&select=id`)).length;
    const refund = await ins("refunds", { order_id: s.orderId, amount: 300, status: "processed", method: "manual" });
    const res = await resolveExceptionByRefund(superadmin, exc[0].id, refund.id, "customer refunded for OOS units");
    expect(res.state).toBe("resolved_refunded");
    expect((await sel(`/inventory_movements?variant_ref=eq.${variantId}&select=id`)).length).toBe(movesBefore);
    r = await recon(variantId);
    expect(r.overlay_ledger_drift).toBe(3); expect(r.refunded_exception_qty).toBe(3);
    expect(r.accounting_explained).toBe(true);   // the fix: refunded shortfall still explains the drift
    expect(r.fully_reconciled).toBe(false);       // but NOT complete until physically disposed

    // Physical disposition (separate, A.1-corrected): MOVEMENT-LESS write-off of the refunded units FROM
    // the batch that physically held them. Restores PHYSICAL conservation but is a SYNTHETIC disposition —
    // it must NOT be read as verified sale→batch attribution, so fully_reconciled/activation stay false.
    const stockPre = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const d = await disposeExceptionShortfall(superadmin, exc[0].id, s.batchId, "units destroyed with refund");
    expect(d.ok).toBe(true); expect(d.writtenOff).toBe(3);
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(stockPre); // no aggregate change
    r = await recon(variantId);
    expect(r.physical_consistent).toBe(true);            // aggregate == Σ batch on-hand (conservation restored)
    expect(r.overlay_ledger_drift).toBe(3);              // sale stays UN-attributed (drift persists — honest)
    expect(r.written_off_qty).toBe(3); expect(r.has_synthetic_disposition).toBe(true);
    expect(r.accounting_explained).toBe(true);           // drift explained by the written-off exception
    expect(r.fully_reconciled).toBe(false);              // synthetic ≠ verified → NOT fully reconciled
    expect(r.activation_eligible).toBe(false);           // cannot activate on a synthetic disposition
    expect((await getOrderExceptions(s.orderId))[0].state).toBe("resolved_written_off");
    // the write-off created NO sale→batch attribution and NO batch_allocation (no fabricated provenance)
    expect((await sel(`/batch_stock_entries?variant_id=eq.${variantId}&entry_type=eq.writeoff&select=movement_id,qty`)).every((e: any) => e.movement_id === null)).toBe(true);
  });

  it("11. refund-evidence integrity: processing→refund_initiated (still open), failed refund rejected", async () => {
    const { variantId } = await makeVariant(true);
    const s = await shortfallOrder(variantId, 2, 2); // shortfall 2
    const exc = (await getOrderExceptions(s.orderId))[0];
    // a FAILED refund is not valid evidence
    const bad = await ins("refunds", { order_id: s.orderId, amount: 200, status: "failed", method: "gateway" });
    await expect(resolveExceptionByRefund(superadmin, exc.id, bad.id)).rejects.toThrow();
    // a refund for a DIFFERENT order is rejected
    const otherOrder = await ins("orders", { order_number: `RRT-X-${RUNK}-${saleN++}`, email: "t@example.test", status: "pending", payment_status: "paid", total_amount: 100 });
    const wrong = await ins("refunds", { order_id: otherOrder.id, amount: 100, status: "processed", method: "manual" });
    await expect(resolveExceptionByRefund(superadmin, exc.id, wrong.id)).rejects.toThrow();
    // a PROCESSING refund advances to refund_initiated but keeps the exception OPEN (fulfilment blocked)
    const pending = await ins("refunds", { order_id: s.orderId, amount: 200, status: "processing", method: "manual" });
    const res = await resolveExceptionByRefund(superadmin, exc.id, pending.id);
    expect(res.state).toBe("refund_initiated");
    expect((await rpc("order_allocation_blocked", { p_order_id: s.orderId })).body).toBe(true);
  });

  it("12. fulfilment eligibility: open exception blocks; refund unblocks the exception; fully-refunded & cancelled orders stay unshippable", async () => {
    const { variantId } = await makeVariant(true);
    const s = await shortfallOrder(variantId, 2, 2); // shortfall 2 → open exception; order total 200
    expect((await rpc("order_allocation_blocked", { p_order_id: s.orderId })).body).toBe(true);
    expect((await rpc("order_fulfillment_blocked", { p_order_id: s.orderId })).body.reason).toBe("allocation_exception");
    await expect(advanceFulfillment(s.orderNumber, "picking" as any, { actorId })).rejects.toThrow(/order_allocation_exception_unresolved/);
    const exc = (await getOrderExceptions(s.orderId))[0];
    const refund = await ins("refunds", { order_id: s.orderId, amount: 200, status: "processed", method: "manual" });
    await resolveExceptionByRefund(superadmin, exc.id, refund.id);
    expect((await rpc("order_allocation_blocked", { p_order_id: s.orderId })).body).toBe(false); // exception no longer open
    // A FULLY refunded order (payment_status='refunded', as settle_refund would set) must NOT be shippable.
    await patch(`/orders?id=eq.${s.orderId}`, { payment_status: "refunded" });
    expect((await rpc("order_fulfillment_blocked", { p_order_id: s.orderId })).body.reason).toBe("fully_refunded");
    await expect(advanceFulfillment(s.orderNumber, "picking" as any, { actorId })).rejects.toThrow(/order_not_fulfillable:fully_refunded/);
    // A cancelled order is likewise unshippable (server-side, not a UI warning).
    const c = await makeVariant(true); const cb = await releasedBatch(c.variantId, 3); const cs = await sale(c.variantId, 1); void cb;
    await patch(`/orders?id=eq.${cs.orderId}`, { status: "cancelled" });
    expect((await rpc("order_fulfillment_blocked", { p_order_id: cs.orderId })).body.reason).toBe("cancelled");
    await expect(advanceFulfillment(cs.orderNumber, "picking" as any, { actorId })).rejects.toThrow(/order_not_fulfillable:cancelled/);
  });

  it("13. A.1 backdate guard: a backdated unattributed tracked movement cannot dodge the epoch", async () => {
    const { variantId } = await makeVariant(true);
    const v = (await sel(`/variants?id=eq.${variantId}&select=stock,sku,variant_name,product_id`))[0];
    const prod = (await sel(`/products?id=eq.${v.product_id}&select=name`))[0];
    // Directly insert a tracked sale movement dated years in the past (would be pre-epoch, hence exempt,
    // if created_at were honoured). The guard pins created_at→now(), so attribution is required and the
    // unattributed insert is rejected at commit.
    const r = await fetch(rest("/inventory_movements"), {
      method: "POST", headers: H,
      body: JSON.stringify({
        variant_id: variantId, variant_ref: variantId, sku_snapshot: v.sku, product_name_snapshot: prod.name,
        variant_name_snapshot: v.variant_name, quantity_before: v.stock, quantity_delta: -1, quantity_after: v.stock - 1,
        movement_type: "sale", source_type: "order", created_at: "2020-01-01T00:00:00Z",
      }),
    });
    expect(r.ok).toBe(false); // deferred attribution constraint fires → cannot bypass
  });

  it("14. untracked returns + RTO remain byte-identical: full restockable moves, no overlay/hold", async () => {
    const { variantId } = await makeVariant(false); // untracked
    await patch(`/variants?id=eq.${variantId}`, { stock: 10 });
    const tag = `${RUNK}-${saleN++}`;
    const o = await ins("orders", { order_number: `RRT-${tag}`, email: "t@example.test", status: "shipped", payment_status: "paid", total_amount: 300 });
    await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 3, line_subtotal: 300, line_total: 300 });
    const rId = await makeReturn(o.id, `RRT-${tag}`, variantId, 3);
    const before = (await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock;
    const res = await receiveReturnGoods(rId, [{ variantId, received: 3, restockable: 2, damaged: 1 }], { actorId });
    expect(res.ok).toBe(true); expect(res.restocked).toBe(2); // full restockable, no batch logic
    expect((await sel(`/variants?id=eq.${variantId}&select=stock`))[0].stock).toBe(before + 2);
    expect(await overlaysFor(o.id)).toHaveLength(0); // no batch overlay for untracked
    expect(await holdsFor(o.id)).toHaveLength(0);     // no holds for untracked
  });

  it("15. concurrent return receipt + order cancellation on a tracked variant stay conserved", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 10);
    const s1 = await sale(variantId, 3);
    const s2 = await sale(variantId, 3);
    const rId = await makeReturn(s1.orderId, s1.orderNumber, variantId, 2);
    const [ret, cancel] = await Promise.all([
      receiveReturnGoods(rId, [{ variantId, received: 2, restockable: 2, damaged: 0 }], { actorId }),
      rpc("cancel_order", { p: { order_id: s2.orderId, release_inventory: true, actor_id: actorId } }),
    ]);
    expect(ret.ok).toBe(true);
    expect(cancel.body.ok).toBe(true);
    const rr = await recon(variantId);
    expect(rr.overlay_ledger_drift).toBe(0);
    expect(rr.fully_reconciled).toBe(true);
    void b;
  });

  it("16. privileged mutation boundaries: overlay/epoch are immutable; untagged & unsupported tracked movements fail closed", async () => {
    const { variantId } = await makeVariant(true);
    const b = await releasedBatch(variantId, 5);
    await sale(variantId, 2); // creates a sale overlay + release overlay
    const ov = (await sel(`/batch_stock_entries?variant_id=eq.${variantId}&select=id&limit=1`))[0];
    // overlay rows are append-only: no UPDATE / DELETE grant to service_role
    expect((await fetch(rest(`/batch_stock_entries?id=eq.${ov.id}`), { method: "PATCH", headers: H, body: JSON.stringify({ qty: 999 }) })).ok).toBe(false);
    expect((await fetch(rest(`/batch_stock_entries?id=eq.${ov.id}`), { method: "DELETE", headers: H })).ok).toBe(false);
    // tracking epoch is append-only: no UPDATE / DELETE grant
    const ep = (await sel(`/variant_tracking_epochs?variant_id=eq.${variantId}&select=id&limit=1`))[0];
    expect((await fetch(rest(`/variant_tracking_epochs?id=eq.${ep.id}`), { method: "PATCH", headers: H, body: JSON.stringify({ epoch_at: "2099-01-01" }) })).ok).toBe(false);
    expect((await fetch(rest(`/variant_tracking_epochs?id=eq.${ep.id}`), { method: "DELETE", headers: H })).ok).toBe(false);
    // untagged restock + unsupported movement type on a tracked variant → fail closed at commit
    const v = (await sel(`/variants?id=eq.${variantId}&select=stock,sku,variant_name,product_id`))[0];
    const prod = (await sel(`/products?id=eq.${v.product_id}&select=name`))[0];
    for (const mt of ["return_restock", "banana_type"]) {
      const r = await fetch(rest("/inventory_movements"), { method: "POST", headers: H, body: JSON.stringify({
        variant_id: variantId, variant_ref: variantId, sku_snapshot: v.sku, product_name_snapshot: prod.name, variant_name_snapshot: v.variant_name,
        quantity_before: v.stock, quantity_delta: 1, quantity_after: v.stock + 1, movement_type: mt, source_type: "system" }) });
      expect(r.ok).toBe(false); // no overlay attribution (or unsupported type) → constraint/CHECK rejects
    }
    expect(await drift_(variantId)).toBe(0);
    void b;
  });

  it("17. activation epoch: a sale committing AFTER activation attributes (no evasion); epoch is durable", async () => {
    const { variantId } = await makeVariant(false);           // start untracked (no epoch)
    expect((await sel(`/variant_tracking_epochs?variant_id=eq.${variantId}&select=id`)).length).toBe(0);
    await setVariantTracking(superadmin, variantId, "tracked"); // stamps the immutable epoch now
    const eps = await sel(`/variant_tracking_epochs?variant_id=eq.${variantId}&select=id,epoch_at`);
    expect(eps.length).toBe(1);                                 // durable epoch identity (not just now()/tracked_at)
    const b = await releasedBatch(variantId, 5);               // release is allowed only once tracked
    const s = await sale(variantId, 2);                        // post-epoch sale → MUST attribute, cannot be exempt
    expect(s.result.created).toBe(true);
    const r = await recon(variantId);
    expect(r.overlay_ledger_drift).toBe(0); expect(r.open_exception_qty).toBe(0); expect(r.fully_reconciled).toBe(true);
    // the sale overlay exists (attributed), proving the post-activation movement did not evade attribution
    expect((await sel(`/batch_stock_entries?source_id=eq.${s.orderId}&entry_type=eq.sale&select=qty`)).reduce((n: number, e: any) => n + e.qty, 0)).toBe(-2);
    void b;
  });

  it("18. receipt-hold disposition lifecycle (restock / quarantine / writeoff) resolves exactly once, no double count", async () => {
    // unknown-origin hold (no provenance) × 3 separate holds, one per disposition mode.
    async function unknownHold(qty: number) {
      const { variantId, productId } = await makeVariant(true);
      await releasedBatch(variantId, 10);
      const elig = await releasedBatch(variantId, 10, "2026-12-15"); // an eligible batch to restock into
      const tag = `${RUNK}-${saleN++}`;
      const o = await ins("orders", { order_number: `RRT-${tag}`, email: "t@example.test", status: "shipped", payment_status: "paid", total_amount: qty * 100 });
      await ins("order_items", { order_id: o.id, product_id: productId, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
      const rId = await makeReturn(o.id, `RRT-${tag}`, variantId, qty);
      await receiveReturnGoods(rId, [{ variantId, received: qty, restockable: qty, damaged: 0 }], { actorId }); // → unknown_origin hold
      const hold = (await sel(`/batch_receipt_holds?order_id=eq.${o.id}&select=id,qty,state`))[0];
      return { variantId, holdId: hold.id, eligBatch: elig };
    }
    // writeoff: no stock change, terminal
    const w = await unknownHold(2);
    const wStock = (await sel(`/variants?id=eq.${w.variantId}&select=stock`))[0].stock;
    expect((await resolveReceiptHold(superadmin, w.holdId, "writeoff", { reason: "discarded" })).ok).toBe(true);
    expect((await sel(`/variants?id=eq.${w.variantId}&select=stock`))[0].stock).toBe(wStock);
    expect((await sel(`/batch_receipt_holds?id=eq.${w.holdId}&select=state`))[0].state).toBe("resolved_writeoff");
    // second resolve is a no-op (no double counting)
    expect((await resolveReceiptHold(superadmin, w.holdId, "restock", { batchId: w.eligBatch })).ok).toBe(true);
    expect((await sel(`/variants?id=eq.${w.variantId}&select=stock`))[0].stock).toBe(wStock);

    // quarantine: records batch_quarantine, no sellable change
    const q = await unknownHold(2);
    const qStock = (await sel(`/variants?id=eq.${q.variantId}&select=stock`))[0].stock;
    expect((await resolveReceiptHold(superadmin, q.holdId, "quarantine", { batchId: q.eligBatch, reason: "hold to quarantine" })).ok).toBe(true);
    expect((await sel(`/variants?id=eq.${q.variantId}&select=stock`))[0].stock).toBe(qStock);
    expect((await quarFor(q.eligBatch)).reduce((n: number, x: any) => n + x.qty, 0)).toBe(2);

    // restock: adds to sellable via an eligible batch (movement + overlay), reconciled
    const re = await unknownHold(2);
    const reStock = (await sel(`/variants?id=eq.${re.variantId}&select=stock`))[0].stock;
    expect((await resolveReceiptHold(superadmin, re.holdId, "restock", { batchId: re.eligBatch })).ok).toBe(true);
    expect((await sel(`/variants?id=eq.${re.variantId}&select=stock`))[0].stock).toBe(reStock + 2);
    expect((await recon(re.variantId)).fully_reconciled).toBe(true);
  });
});

const drift_ = async (v: string) => (await variantReconciliation(v)).overlay_ledger_drift;
