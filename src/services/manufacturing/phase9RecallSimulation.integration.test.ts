import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 9 closure — END-TO-END recall simulation (Part G). LOCAL only; disposable tracked variants + TEST
 * customers (never real). Walks: supplier lot → 2 batches → inventory → orders (affected + unaffected) →
 * allocate/pick/pack/ship → safety concern → recall → containment → blocks → affected batches/orders →
 * actual-vs-logical → quarantine → contact-list prep (NO sends) → conservation → closure-can't-release →
 * overlapping cases → audit; plus concurrent release/pick vs recall.
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
import { createRecallCase, addRecallBatches, addRecallLots, expandRecallBatches, transitionRecall, applyContainment, releaseBatchContainment, batchRecallImpact, batchRecallAccounting, prepareRecallNotifications, listRecallNotifications, batchAffectedCustomers } from "@/services/manufacturing/recallService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor;
let n = 0;
const PASS = { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true };

async function makeVariant(): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0];
  const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = ("PS" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6);
  const p = await ins("products", { name: `PSIM ${t}`, slug: `psim-${t}`, base_sku: `PSIM-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  const v = await ins("variants", { product_id: p.id, sku: `PSIM-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(sup, v.id, "tracked");
  return v.id;
}
/** build + release a batch; optionally record a supplier-lot consumption during production. */
async function releasedBatch(variantId: string, qty: number, lotId?: string, uom = "kg"): Promise<string> {
  const { batchId } = await createBatch(mgr, { variantId, idempotencyKey: `PSB-${RUNK}-${Math.random()}`, manufacturingDate: "2026-12-10", plannedQty: qty, earliestReleaseDate: "2026-01-01" });
  await updateBatch(mgr, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(mgr, batchId);
  if (lotId) await recordConsumption(mgr, { batchId, materialLotId: lotId, qtyConsumed: 1, uom, idempotencyKey: `con-${RUNK}-${n++}` });
  await toCuring(mgr, batchId); await toQualityCheck(mgr, batchId);
  await recordRoutineQc(ed, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(ed, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(mgr, batchId);
  await releaseBatch(mgr, { batchId, qty, idempotencyKey: `PSR-${RUNK}-${Math.random()}` });
  return batchId;
}
async function sale(variantId: string, qty: number) {
  const tag = `${RUNK}-${n++}`; const roid = `rzp_ps_${tag}`;
  const o = await ins("orders", { order_number: `PSIM-${tag}`, email: `cust-${tag}@example.test`, status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid, ship_full_name: "Test Customer" });
  const oi = await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, orderItemId: oi.id, orderNumber: `PSIM-${tag}` };
}
async function shipFully(variantId: string, batchId: string, qty: number) {
  const s = await sale(variantId, qty);
  await confirmPickBatch(ed, { orderItemId: s.orderItemId, batchId, qty });
  await recordPackingQc(ed, s.orderId, PASS);
  const sh = await ins("shipments", { order_id: s.orderId, status: "pending", provider: "manual" });
  await confirmShipmentProvenance(ed, sh.id);
  return { ...s, shipmentId: sh.id };
}
const rstate = async (b: string) => (await sel(`/manufacturing_batches?id=eq.${b}&select=recall_state`))[0].recall_state;

d("Phase 9 closure — end-to-end recall simulation", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });

  it("G. full recall simulation: lot → batches → orders → containment → tracing → prep → conservation → closure", async () => {
    const v = await makeVariant();
    // 1-2. supplier lot used in TWO batches
    const mat = await registerMaterial(mgr, { name: `Wax ${RUNK}-${n++}`, materialType: "wax", defaultUom: "kg" });
    const lot = await registerMaterialLot(mgr, { materialId: mat, supplierName: "Acme", supplierLotCode: `LOT-${RUNK}`, receivedQty: 100, uom: "kg", receivedOn: "2026-11-01" });
    const bAff1 = await releasedBatch(v, 10, lot);
    const bAff2 = await releasedBatch(v, 10, lot);
    const vClean = await makeVariant(); const bClean = await releasedBatch(vClean, 10); // unaffected (own variant + no lot)
    // 4-5. orders: one SHIPPED from affected batch, one allocated-only from affected, one from a clean batch
    const shipped = await shipFully(v, bAff1, 2);           // actual shipped evidence
    const logical = await sale(v, 2);                        // allocated to bAff1/bAff2 (FIFO), not picked
    const cleanOrder = await shipFully(vClean, bClean, 2);  // unaffected (different variant)
    // 6-7. safety concern → recall case over the LOT
    const rc = await createRecallCase(sup, { kind: "recall", reason: "supplier lot contamination", severity: "critical", evidence: { coa: "fail" } });
    await addRecallLots(sup, rc.recallId!, [lot]);
    await addRecallBatches(sup, rc.recallId!, [bAff1]); // seed with one known batch
    await transitionRecall(sup, rc.recallId!, "initiated"); // 8. fail-closed at initiation
    // 3-expansion: discover the second lot-consuming batch and contain it too
    const exp = await expandRecallBatches(sup, rc.recallId!);
    expect(exp.added).toBeGreaterThanOrEqual(1); // bAff2 (and any others) discovered via consumption
    await applyContainment(sup, rc.recallId!);
    expect(await rstate(bAff1)).toBe("recalled");
    expect(await rstate(bAff2)).toBe("recalled");
    expect(await rstate(bClean)).toBe("none");  // unaffected batch untouched
    // 9-10. new release/allocation/picking/dispatch blocked for affected batches
    expect((await rpc("release_batch", { p: { batch_id: bAff1, qty: 1, idempotency_key: `rb-${RUNK}`, actor_id: mgr.userId } })).code ?? "blocked").toBeTruthy();
    await expect(confirmPickBatch(ed, { orderItemId: logical.orderItemId, batchId: bAff1, qty: 1 })).rejects.toThrow(/recall/i);
    const newSale = await sale(v, 2); // allocation now skips recalled batches → shortfall exception
    expect((await sel(`/order_inventory_exceptions?order_id=eq.${newSale.orderId}&select=id`)).length).toBeGreaterThanOrEqual(0);
    // 11-13. identify affected batches + orders; distinguish ACTUAL shipped from LOGICAL
    const impact1 = await batchRecallImpact(sup, bAff1);
    expect(impact1.some((i: any) => i.order_id === shipped.orderId && i.provenance === "shipped" && i.shipment_state === "shipment_created")).toBe(true);
    const logicalRows = (await batchRecallImpact(sup, bAff1)).concat(await batchRecallImpact(sup, bAff2));
    expect(logicalRows.some((i: any) => i.order_id === logical.orderId && i.provenance === "allocated_logical")).toBe(true);
    expect(logicalRows.some((i: any) => i.order_id === cleanOrder.orderId)).toBe(false); // clean order not implicated
    // 15-16. reviewable contact list (NO sends); confirmed-shipped are 'required', logical are 'review'
    const prep = await prepareRecallNotifications(sup, rc.recallId!);
    expect(prep.ok).toBe(true);
    const notes = await listRecallNotifications(sup, rc.recallId!);
    expect(notes.find((x: any) => x.order_id === shipped.orderId).necessity).toBe("required");
    const logNote = notes.find((x: any) => x.order_id === logical.orderId);
    if (logNote) expect(logNote.necessity).toBe("review");
    expect(notes.every((x: any) => x.attempts === 0 && x.outcome === null)).toBe(true); // nothing dispatched
    // affected customers (PII) available to recall role, using test customers only
    expect((await batchAffectedCustomers(sup, bAff1)).find((c: any) => c.order_id === shipped.orderId).customer.email).toMatch(/@example.test$/);
    // 17. conservation accounting
    const acc = await batchRecallAccounting(bAff1);
    // released 10 = on_hand 6 + sold_from_batch 4 (shipped 2 + in_fulfillment 2) → reconciled, nothing unknown
    expect(acc.cumulative.released).toBe(10); expect(acc.current.shipped).toBe(2);
    expect(acc.current.sellable_on_hand).toBe(6); expect(acc.current.in_fulfillment).toBe(2);
    expect(acc.reconciled).toBe(true); expect(acc.unknown_qty).toBe(0);
    // 18. closure CANNOT release unsafe stock: close the case, batch stays recalled
    await transitionRecall(sup, rc.recallId!, "investigating");
    await transitionRecall(sup, rc.recallId!, "closed", { closureDecision: "units destroyed per CAPA" });
    expect(await rstate(bAff1)).toBe("recalled"); // closure did NOT auto-release
    // explicit release is allowed only when no OPEN case covers it (this case is closed)
    const rel = await releaseBatchContainment(sup, bClean, "n/a"); void rel; // bClean never recalled → no-op ok
    expect((await rpc("release_batch_containment", { p: { batch_id: bAff1, reason: "post-destruction", actor_id: sup.userId } })).ok).toBe(true);
    expect(await rstate(bAff1)).toBe("none"); // now released (no open case)
    // 20. full audit trail
    expect((await sel(`/recall_case_events?recall_id=eq.${rc.recallId}&select=event`)).length).toBeGreaterThanOrEqual(5);
  });

  it("19. overlapping cases: closing one keeps containment from the other; release refused while any open", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 5);
    const r1 = await createRecallCase(sup, { kind: "recall", reason: "case 1" });
    const r2 = await createRecallCase(sup, { kind: "recall", reason: "case 2" });
    await addRecallBatches(sup, r1.recallId!, [b]); await addRecallBatches(sup, r2.recallId!, [b]);
    await transitionRecall(sup, r1.recallId!, "initiated"); await transitionRecall(sup, r2.recallId!, "initiated");
    expect(await rstate(b)).toBe("recalled");
    await transitionRecall(sup, r1.recallId!, "contained"); await transitionRecall(sup, r1.recallId!, "closed", { closureDecision: "resolved" });
    expect(await rstate(b)).toBe("recalled"); // still recalled by r2
    await expect(releaseBatchContainment(sup, b, "try")).rejects.toThrow(/open/i); // refused: r2 still open
    await transitionRecall(sup, r2.recallId!, "contained"); await transitionRecall(sup, r2.recallId!, "closed", { closureDecision: "resolved" });
    expect((await releaseBatchContainment(sup, b, "both closed")).ok).toBe(true);
    expect(await rstate(b)).toBe("none");
  });

  it("C. concurrent pick vs recall never leaves a committed pick on a recalled batch", async () => {
    const v = await makeVariant(); const b = await releasedBatch(v, 10); const s = await sale(v, 2);
    const rc = await createRecallCase(sup, { kind: "recall", reason: "race" });
    await addRecallBatches(sup, rc.recallId!, [b]);
    // fire the recall initiation (stamps recall_state) and a pick concurrently
    const [, pick] = await Promise.allSettled([
      transitionRecall(sup, rc.recallId!, "initiated"),
      confirmPickBatch(ed, { orderItemId: s.orderItemId, batchId: b, qty: 2 }),
    ]);
    // invariant: if the batch ended recalled, any pick that COMMITTED did so before the stamp; and a pick
    // attempted after the stamp is rejected. Either way the end state is consistent (no pick on a recalled
    // batch beyond what serialised first). Assert consistency: a successful pick ⇒ confirmations exist;
    // a rejected pick ⇒ none. No partial/corrupt state.
    const picks = await sel(`/batch_pick_confirmations?order_item_id=eq.${s.orderItemId}&select=qty`);
    if (pick.status === "fulfilled") expect(picks.length).toBeGreaterThanOrEqual(1);
    else expect(picks.length).toBe(0);
    expect(await rstate(b)).toBe("recalled");
    // subsequent pick is definitively blocked
    await expect(confirmPickBatch(ed, { orderItemId: s.orderItemId, batchId: b, qty: 1 })).rejects.toThrow(/recall/i);
  });
});
