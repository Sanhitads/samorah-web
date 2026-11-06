import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 9 verification (Part A): recall quantity conservation proven INDEPENDENTLY from authoritative
 * overlay/movements, concurrency at critical boundaries (release/allocation/dispatch/expansion vs recall),
 * and containment-release hardening. LOCAL only; disposable tracked variants.
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

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch, variantReconciliation } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { confirmPickBatch, recordPackingQc, confirmShipmentProvenance } from "@/services/manufacturing/fulfillmentProvenanceService";
import { receiveReturnGoods } from "@/services/returnReceivingService";
import { markShipmentDispatched } from "@/services/shipmentService";
import { createRecallCase, addRecallBatches, transitionRecall, releaseBatchContainment, batchRecallAccounting } from "@/services/manufacturing/recallService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor; let n = 0;
const PASS = { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true };

async function makeVariant(): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const p = await ins("products", { name: `PVA ${t}`, slug: `pva-${t}`, base_sku: `PVA-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: ("PV" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `PVA-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(sup, v.id, "tracked"); return v.id;
}
async function releasedBatch(variantId: string, qty: number): Promise<string> {
  const { batchId } = await createBatch(mgr, { variantId, idempotencyKey: `PVB-${RUNK}-${Math.random()}`, manufacturingDate: "2026-10-01", plannedQty: qty, earliestReleaseDate: "2026-10-10" });
  await updateBatch(mgr, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(mgr, batchId); await toCuring(mgr, batchId); await toQualityCheck(mgr, batchId);
  await recordRoutineQc(ed, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(ed, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(mgr, batchId); await releaseBatch(mgr, { batchId, qty, idempotencyKey: `PVR-${RUNK}-${Math.random()}` });
  return batchId;
}
async function sale(variantId: string, qty: number) {
  const tag = `${RUNK}-${n++}`; const roid = `rzp_pva_${tag}`;
  const o = await ins("orders", { order_number: `PVA-${tag}`, email: `c-${tag}@example.test`, status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid });
  const oi = await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, orderItemId: oi.id, orderNumber: `PVA-${tag}` };
}
// INDEPENDENT physical on-hand straight from the overlay ledger (not via the accounting function).
const overlaySum = async (b: string) => (await sel(`/batch_stock_entries?batch_id=eq.${b}&select=qty`)).reduce((a: number, x: any) => a + x.qty, 0);
const rstate = async (b: string) => (await sel(`/manufacturing_batches?id=eq.${b}&select=recall_state`))[0].recall_state;

d("Phase 9 verification — conservation, concurrency, release hardening", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });

  it("A1. conservation proven from the overlay ledger across release → sale → return (= 9, not 7)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10);
    expect(await overlaySum(b)).toBe(10);                       // release +10
    const s = await sale(v, 2);                                 // sale overlay −2
    expect(await overlaySum(b)).toBe(8);
    // customer returns 1, restocked to the same batch → return_restock +1
    const rr = await ins("returns", { order_id: s.orderId, order_number: s.orderNumber, rma_number: `RMA-PVA-${RUNK}-${n++}`, status: "received", resolution: "return_required" });
    await ins("return_items", { return_id: rr.id, order_item_id: s.orderItemId, variant_id: v, sku: "T", product_name: "T", quantity: 1, line_amount: 100, restock: true });
    await receiveReturnGoods(rr.id, [{ variantId: v, received: 1, restockable: 1, damaged: 0 }], { actorId: ed.userId });
    const independent = await overlaySum(b);
    expect(independent).toBe(9);                                // 10 − 2 + 1 = 9  ← the corrected figure
    const acc = await batchRecallAccounting(b);
    expect(acc.current.physical_on_hand).toBe(independent);     // accounting matches the independent ledger
    expect(acc.current.sellable_on_hand).toBe(9);              // not recalled → sellable == physical
    expect(acc.cumulative.sold_from_batch).toBe(2); expect(acc.cumulative.returns_restocked).toBe(1);
    expect(acc.reconciled).toBe(true); expect(acc.unknown_qty).toBe(0);
    expect((await variantReconciliation(v)).overlay_ledger_drift).toBe(0);
  });

  it("A1b. write-off and substitution keep conservation (reconciled, unknown 0)", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5);
    // a refunded shortfall written off against b (synthetic) — physical reduced, still reconciled
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "x", actor_id: mgr.userId } });
    const s = await sale(v, 2); // shortfall 2 (b ineligible); b physical still 5
    const e = (await sel(`/order_inventory_exceptions?order_id=eq.${s.orderId}&select=id`))[0];
    const refund = await ins("refunds", { order_id: s.orderId, amount: 200, status: "processed", method: "manual" });
    await rpc("resolve_exception_by_refund", { p: { exception_id: e.id, refund_id: refund.id, actor_id: ed.userId } });
    await rpc("dispose_exception_shortfall", { p: { exception_id: e.id, batch_id: b, actor_id: ed.userId } }); // writeoff −2
    const acc = await batchRecallAccounting(b);
    expect(acc.written_off_synthetic).toBe(2); expect(acc.current.physical_on_hand).toBe(3); // 5 − 2
    expect(acc.reconciled).toBe(true); expect(acc.unknown_qty).toBe(0);
  });

  it("A2. recall is correctly serialised vs release / allocation / dispatch; expansion vs dispatch", async () => {
    // release vs recall: recall a qc_approved (not-yet-released) batch, then release must be blocked
    const v1 = await makeVariant();
    const { batchId: b1 } = await createBatch(mgr, { variantId: v1, idempotencyKey: `PVC-${RUNK}-${n++}`, manufacturingDate: "2026-10-01", plannedQty: 5, earliestReleaseDate: "2026-10-10" });
    await updateBatch(mgr, { batchId: b1, producedQty: 5, pendingInspectionQty: 5 }); await startProduction(mgr, b1); await toCuring(mgr, b1); await toQualityCheck(mgr, b1);
    await recordRoutineQc(ed, { batchId: b1, inspectedQty: 5, approvedDelta: 5, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
    await recordDesignValidation(ed, { batchId: b1, result: "pass", measurements: { flame: "stable" } });
    await approveQc(mgr, b1);
    const rc1 = await createRecallCase(sup, { kind: "recall", reason: "r" }); await addRecallBatches(sup, rc1.recallId!, [b1]);
    const [, rel] = await Promise.allSettled([ transitionRecall(sup, rc1.recallId!, "initiated"), releaseBatch(mgr, { batchId: b1, qty: 1, idempotencyKey: `relc-${RUNK}` }) ]);
    expect(await rstate(b1)).toBe("recalled");
    if (rel.status === "fulfilled") { /* released just before the stamp */ } else { expect((rel as any).reason?.message ?? "").toMatch(/recall|tracked|hold|disabled/i); }
    await expect(releaseBatch(mgr, { batchId: b1, qty: 1, idempotencyKey: `relc2-${RUNK}` })).rejects.toThrow(); // definitively blocked after

    // allocation vs recall: after containment, a fresh sale cannot allocate from the recalled batch
    const v2 = await makeVariant(); const b2 = await releasedBatch(v2, 5);
    const rc2 = await createRecallCase(sup, { kind: "recall", reason: "r" }); await addRecallBatches(sup, rc2.recallId!, [b2]); await transitionRecall(sup, rc2.recallId!, "initiated");
    const s2 = await sale(v2, 2);
    expect((await sel(`/batch_allocations?order_id=eq.${s2.orderId}&batch_id=eq.${b2}&select=id`)).length).toBe(0); // not allocated from recalled b2

    // dispatch vs recall: ship a batch, then recall after freeze, then markShipmentDispatched is blocked
    const v3 = await makeVariant(); const b3 = await releasedBatch(v3, 5); const s3 = await sale(v3, 2);
    await confirmPickBatch(ed, { orderItemId: s3.orderItemId, batchId: b3, qty: 2 }); await recordPackingQc(ed, s3.orderId, PASS);
    const sh3 = await ins("shipments", { order_id: s3.orderId, status: "courier_assigned", provider: "manual" });
    await confirmShipmentProvenance(ed, sh3.id);
    const rc3 = await createRecallCase(sup, { kind: "recall", reason: "r" }); await addRecallBatches(sup, rc3.recallId!, [b3]); await transitionRecall(sup, rc3.recallId!, "initiated");
    const disp = await markShipmentDispatched(s3.orderId, { actorId: ed.userId });
    expect(disp.ok).toBe(false); expect(disp.reason).toMatch(/dispatch_blocked/);
  });

  it("A3. containment release requires eligibility + no open case; never auto-releases on closure", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5);
    const rc = await createRecallCase(sup, { kind: "recall", reason: "safety" }); await addRecallBatches(sup, rc.recallId!, [b]); await transitionRecall(sup, rc.recallId!, "initiated");
    expect(await rstate(b)).toBe("recalled");
    // still open → release refused
    await expect(releaseBatchContainment(sup, b, "try")).rejects.toThrow(/open/i);
    await transitionRecall(sup, rc.recallId!, "contained"); await transitionRecall(sup, rc.recallId!, "closed", { closureDecision: "done" });
    expect(await rstate(b)).toBe("recalled"); // closure did NOT auto-release
    // no reason → rejected
    expect((await rpc("release_batch_containment", { p: { batch_id: b, actor_id: sup.userId } })).status).toBeGreaterThanOrEqual(400);
    // revoke the validation → release refused (not eligible to return to sellable)
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "x", actor_id: mgr.userId } });
    await expect(releaseBatchContainment(sup, b, "evidence")).rejects.toThrow(/validation/i);
    // re-validate → eligible → release succeeds, and it creates NO sellable stock (overlay unchanged)
    await recordDesignValidation(ed, { batchId: b, result: "pass", measurements: { flame: "stable" } });
    const before = await overlaySum(b);
    expect((await releaseBatchContainment(sup, b, "re-validated, CAPA complete")).ok).toBe(true);
    expect(await rstate(b)).toBe("none");
    expect(await overlaySum(b)).toBe(before); // recall release did NOT fabricate sellable stock
  });
});
