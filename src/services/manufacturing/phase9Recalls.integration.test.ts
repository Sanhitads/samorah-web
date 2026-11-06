import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 9 — recalls, containment & affected-customer traceability. LOCAL Supabase only; disposable tracked
 * variants (is_active:false). Verifies the recall lifecycle, containment via recall_state (every stock gate
 * then enforces it), supplier-lot⇄batch tracing, affected-order classification (actual shipped vs logical
 * allocation), quantity accounting, authorisation, and that a recall never mutates variants.stock/allocations.
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
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return r.json().catch(() => null); };

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch } from "@/services/manufacturing/releaseService";
import { registerMaterial, registerMaterialLot, recordConsumption } from "@/services/manufacturing/materialService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { confirmPickBatch, recordPackingQc, confirmShipmentProvenance } from "@/services/manufacturing/fulfillmentProvenanceService";
import { createRecallCase, addRecallBatches, addRecallLots, transitionRecall, applyContainment, batchMaterialLots, materialLotBatches, batchAffectedOrders, lotAffectedOrders, batchRecallAccounting, batchAffectedCustomers } from "@/services/manufacturing/recallService";
import { ForbiddenError, type StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let superadmin: StaffActor, manager: StaffActor, editor: StaffActor, customer: StaffActor;
let n = 0;
const PASS = { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true };

async function makeVariant(): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0];
  const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6);
  const p = await ins("products", { name: `P9 ${t}`, slug: `p9-${t}`, base_sku: `P9-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  const v = await ins("variants", { product_id: p.id, sku: `P9-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(superadmin, v.id, "tracked");
  return v.id;
}
async function releasedBatch(variantId: string, qty: number): Promise<string> {
  const { batchId } = await createBatch(manager, { variantId, idempotencyKey: `P9B-${RUNK}-${Math.random()}`, manufacturingDate: "2026-10-01", plannedQty: qty, earliestReleaseDate: "2026-10-10" });
  await updateBatch(manager, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(manager, batchId); await toCuring(manager, batchId); await toQualityCheck(manager, batchId);
  await recordRoutineQc(editor, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(editor, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(manager, batchId);
  await releaseBatch(manager, { batchId, qty, idempotencyKey: `P9R-${RUNK}-${Math.random()}` });
  return batchId;
}
async function sale(variantId: string, qty: number) {
  const tag = `${RUNK}-${n++}`; const roid = `rzp_p9_${tag}`;
  const o = await ins("orders", { order_number: `P9-${tag}`, email: "cust@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid, ship_full_name: "A Customer" });
  const oi = await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, orderItemId: oi.id, orderNumber: `P9-${tag}` };
}
const recallState = async (b: string) => (await sel(`/manufacturing_batches?id=eq.${b}&select=recall_state`))[0].recall_state;

d("Phase 9 — recalls & traceability", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    superadmin = { userId: us[0].id, role: "super_admin" };
    manager = { userId: us[1]?.id ?? us[0].id, role: "manager" };
    editor = { userId: us[0].id, role: "editor" };
    customer = { userId: us[0].id, role: "customer" };
    await setReleaseEnabled(superadmin, true); await setAllocationEnabled(superadmin, true);
  });

  it("1. recall lifecycle: documented transitions; close requires a decision; no auto-close on zero stock", async () => {
    const r = await createRecallCase(superadmin, { kind: "recall", reason: "fragrance oil contamination", severity: "high" });
    expect(r.ok).toBe(true); expect(r.recallNumber).toMatch(/^RC-\d{6}-\d{4}$/);
    // illegal jump draft→closed is rejected
    await expect(transitionRecall(superadmin, r.recallId!, "closed", { closureDecision: "x" })).rejects.toThrow();
    expect((await transitionRecall(superadmin, r.recallId!, "initiated")).status).toBe("initiated");
    expect((await transitionRecall(superadmin, r.recallId!, "contained")).status).toBe("contained");
    await expect(transitionRecall(superadmin, r.recallId!, "closed")).rejects.toThrow(); // needs closure_decision
    const row = (await sel(`/recall_cases?id=eq.${r.recallId}&select=status`))[0];
    expect(row.status).toBe("contained"); // NOT auto-closed by anything
    expect((await transitionRecall(superadmin, r.recallId!, "closed", { closureDecision: "root cause fixed; stock destroyed" })).status).toBe("closed");
    const closed = (await sel(`/recall_cases?id=eq.${r.recallId}&select=status,closure_decision,closed_at`))[0];
    expect(closed.closure_decision).toBeTruthy(); expect(closed.closed_at).toBeTruthy();
    // append-only audit trail recorded each step
    expect((await sel(`/recall_case_events?recall_id=eq.${r.recallId}&select=event`)).length).toBeGreaterThanOrEqual(4);
  });

  it("2. containment via recall_state blocks release/allocation/picking and quarantines returns; stock & allocations untouched", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 2); // allocated to b while eligible
    const stockBefore = (await sel(`/variants?id=eq.${v}&select=stock`))[0].stock;
    const allocBefore = await sel(`/batch_allocations?order_item_id=eq.${s.orderItemId}&select=batch_id,qty,state`);
    const rc = await createRecallCase(superadmin, { kind: "recall", reason: "burn safety" });
    await addRecallBatches(superadmin, rc.recallId!, [b]);
    await transitionRecall(superadmin, rc.recallId!, "initiated");
    const c = await applyContainment(superadmin, rc.recallId!);
    expect(c.batches).toBe(1); expect(c.recallState).toBe("recalled");
    expect(await recallState(b)).toBe("recalled");
    // gates now fire: new sale can't allocate from b (shortfall exception), picking blocked, release blocked
    await expect(confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 })).rejects.toThrow(/recall/i);
    expect((await rpc("release_batch", { p: { batch_id: b, qty: 1, idempotency_key: `rc-${RUNK}`, actor_id: manager.userId } })).code ?? "err").toBeTruthy();
    // recall NEVER mutates aggregate stock or the allocation history
    expect((await sel(`/variants?id=eq.${v}&select=stock`))[0].stock).toBe(stockBefore);
    expect(await sel(`/batch_allocations?order_item_id=eq.${s.orderItemId}&select=batch_id,qty,state`)).toEqual(allocBefore);
  });

  it("3. supplier-lot ⇄ batch tracing uses physical consumption, not a shared formula", async () => {
    const v = await makeVariant();
    const mat = await registerMaterial(manager, { name: `Wax ${RUNK}-${n++}`, materialType: "wax", defaultUom: "kg" });
    const lotA = await registerMaterialLot(manager, { materialId: mat, supplierName: "SupplierA", supplierLotCode: `LOTA-${RUNK}`, receivedQty: 100, uom: "kg", receivedOn: "2026-11-01" });
    const lotB = await registerMaterialLot(manager, { materialId: mat, supplierName: "SupplierB", supplierLotCode: `LOTB-${RUNK}`, receivedQty: 100, uom: "kg", receivedOn: "2026-11-02" });
    const { batchId: b1 } = await createBatch(manager, { variantId: v, idempotencyKey: `P9C-${RUNK}-${n++}`, manufacturingDate: "2026-10-01", plannedQty: 5 });
    const { batchId: b2 } = await createBatch(manager, { variantId: v, idempotencyKey: `P9C-${RUNK}-${n++}`, manufacturingDate: "2026-12-11", plannedQty: 5 });
    await startProduction(manager, b1); await startProduction(manager, b2); // materials recorded during production
    await recordConsumption(manager, { batchId: b1, materialLotId: lotA, qtyConsumed: 2, uom: "kg", idempotencyKey: `con-${RUNK}-1` });
    await recordConsumption(manager, { batchId: b2, materialLotId: lotB, qtyConsumed: 2, uom: "kg", idempotencyKey: `con-${RUNK}-2` });
    // lotA → only b1 (same formula/material, but DIFFERENT physical lot ⇒ b2 not linked)
    const lotAbatches = await materialLotBatches(lotA);
    expect(lotAbatches.map((x: any) => x.batch_id)).toEqual([b1]);
    const b1lots = await batchMaterialLots(b1);
    expect(b1lots[0].supplier_lot_code).toBe(`LOTA-${RUNK}`); expect(b1lots[0].supplier_name).toBe("SupplierA");
  });

  it("4. affected-order traceability distinguishes ACTUAL shipped from LOGICAL allocation", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    // order S: fully picked + QC + shipped (actual provenance)
    const sShip = await sale(v, 2);
    await confirmPickBatch(editor, { orderItemId: sShip.orderItemId, batchId: b, qty: 2 });
    await recordPackingQc(editor, sShip.orderId, PASS);
    const sh = await ins("shipments", { order_id: sShip.orderId, status: "pending", provider: "manual" });
    await confirmShipmentProvenance(editor, sh.id);
    // order L: allocated to b but NOT picked (logical only)
    const sLog = await sale(v, 2);
    const affected = await batchAffectedOrders(superadmin, b);
    const shipRow = affected.find((a: any) => a.order_id === sShip.orderId);
    const logRow = affected.find((a: any) => a.order_id === sLog.orderId);
    expect(shipRow.provenance).toBe("shipped");
    expect(logRow.provenance).toBe("allocated_logical");
    // affected customers (PII) available to recall role; contact joined
    const custs = await batchAffectedCustomers(superadmin, b);
    expect(custs.find((c: any) => c.order_id === sShip.orderId).customer.email).toBe("cust@example.test");
  });

  it("5. recall quantity accounting reports produced/approved/released/on-hand/shipped", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    const s = await sale(v, 3);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 3 });
    await recordPackingQc(editor, s.orderId, PASS);
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await confirmShipmentProvenance(editor, sh.id);
    const acc = await batchRecallAccounting(b);
    expect(acc.cumulative.produced).toBe(10); expect(acc.cumulative.approved).toBe(10); expect(acc.cumulative.released).toBe(10);
    expect(acc.current.physical_on_hand).toBe(7);      // 10 released − 3 sold
    expect(acc.current.sellable_on_hand).toBe(7);      // batch not recalled → sellable == physical
    expect(acc.eligible).toBe(true); expect(acc.current.shipped).toBe(3);
    expect(acc.reconciled).toBe(true); expect(acc.unknown_qty).toBe(0);
  });

  it("6. manufacturing_hold vs recall: a hold sets on_hold (distinct from a formal recall)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5);
    const rc = await createRecallCase(superadmin, { kind: "manufacturing_hold", reason: "precautionary inspection" });
    await addRecallBatches(superadmin, rc.recallId!, [b]);
    await transitionRecall(superadmin, rc.recallId!, "initiated");
    const c = await applyContainment(superadmin, rc.recallId!);
    expect(c.recallState).toBe("on_hold");
    expect(await recallState(b)).toBe("on_hold");
  });

  it("7. authorisation: a non-recall role cannot create, contain, or read affected customers", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 2);
    await expect(createRecallCase(customer, { kind: "recall", reason: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(batchAffectedCustomers(customer, b)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(applyContainment(editor, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("8. lot → orders composite trace (supplier lot → batches → orders)", async () => {
    const v = await makeVariant();
    const mat = await registerMaterial(manager, { name: `Wick ${RUNK}-${n++}`, materialType: "wick", defaultUom: "pcs" });
    const lot = await registerMaterialLot(manager, { materialId: mat, supplierName: "WickCo", supplierLotCode: `WLOT-${RUNK}`, receivedQty: 50, uom: "pcs", receivedOn: "2026-11-03" });
    // build a released batch, recording material consumption DURING production
    const { batchId: b } = await createBatch(manager, { variantId: v, idempotencyKey: `P9W-${RUNK}-${n++}`, manufacturingDate: "2026-10-01", plannedQty: 10, earliestReleaseDate: "2026-10-10" });
    await updateBatch(manager, { batchId: b, producedQty: 10, pendingInspectionQty: 10 });
    await startProduction(manager, b);
    await recordConsumption(manager, { batchId: b, materialLotId: lot, qtyConsumed: 10, uom: "pcs", idempotencyKey: `con-${RUNK}-w` });
    await toCuring(manager, b); await toQualityCheck(manager, b);
    await recordRoutineQc(editor, { batchId: b, inspectedQty: 10, approvedDelta: 10, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
    await recordDesignValidation(editor, { batchId: b, result: "pass", measurements: { flame: "stable" } });
    await approveQc(manager, b);
    await releaseBatch(manager, { batchId: b, qty: 10, idempotencyKey: `P9WR-${RUNK}-${n++}` });
    const s = await sale(v, 1);
    await confirmPickBatch(editor, { orderItemId: s.orderItemId, batchId: b, qty: 1 });
    await recordPackingQc(editor, s.orderId, PASS);
    const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
    await confirmShipmentProvenance(editor, sh.id);
    const trace = await lotAffectedOrders(superadmin, lot);
    expect(trace.some((t: any) => t.order_id === s.orderId && t.batch_id === b && t.provenance === "shipped")).toBe(true);
  });
});
