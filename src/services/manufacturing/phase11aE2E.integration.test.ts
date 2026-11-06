import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 11A — integrated cross-module E2E: manufacturing → QC/release → inventory → commerce → fulfillment
 * (actual-batch pick + shipment provenance) → return → recall/containment → label. One disposable tracked
 * variant; proves the modules interoperate and conservation/gates hold end-to-end. (Exhaustive per-bullet
 * coverage lives in the dedicated suites; this is the consolidated happy-path + key safety gate.)
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
const rpc = async (fn: string, body: any) => (await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) })).json().catch(() => null);

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch, variantReconciliation } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { confirmPickBatch, recordPackingQc, confirmShipmentProvenance } from "@/services/manufacturing/fulfillmentProvenanceService";
import { receiveReturnGoods } from "@/services/returnReceivingService";
import { createRecallCase, addRecallBatches, transitionRecall } from "@/services/manufacturing/recallService";
import { listLabelTemplates, generateLabel } from "@/services/manufacturing/labelService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor; let nn = 0;
const PASS = { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true };

d("Phase 11A — integrated cross-module E2E", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });

  it("manufacturing → release → sale → pick/ship → return → recall → label, conserved throughout", async () => {
    // Manufacturing + QC + release
    const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${nn++}`;
    const p = await ins("products", { name: `E2E ${t}`, slug: `e2e-${t}`, base_sku: `E2E-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: ("E2"+Math.random().toString(36).slice(2,5)).toUpperCase().slice(0,6) });
    const v = (await ins("variants", { product_id: p.id, sku: `E2E-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", variant_name: "Glass 100g", tracking_state: "untracked", is_active: false })).id;
    await setVariantTracking(sup, v, "tracked");
    const { batchId: b } = await createBatch(mgr, { variantId: v, idempotencyKey: `E2B-${RUNK}`, manufacturingDate: "2026-10-01", plannedQty: 10, earliestReleaseDate: "2026-10-10" });
    await updateBatch(mgr, { batchId: b, producedQty: 10, pendingInspectionQty: 10 });
    await startProduction(mgr, b); await toCuring(mgr, b); await toQualityCheck(mgr, b);
    await recordRoutineQc(ed, { batchId: b, inspectedQty: 10, approvedDelta: 10, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
    await recordDesignValidation(ed, { batchId: b, result: "pass", measurements: { flame: "stable" } });
    await approveQc(mgr, b); await releaseBatch(mgr, { batchId: b, qty: 10, idempotencyKey: `E2R-${RUNK}` });
    expect((await variantReconciliation(v)).fully_reconciled).toBe(true);

    // Commerce: a paid sale allocates to the batch
    const roid = `rzp_e2e_${t}`;
    const o = await ins("orders", { order_number: `E2E-${t}`, email: `e2e-${t}@example.test`, status: "pending", payment_status: "pending", total_amount: 300, razorpay_order_id: roid, ship_full_name: "E2E" });
    const oi = await ins("order_items", { order_id: o.id, variant_id: v, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 3, line_subtotal: 300, line_total: 300 });
    await ins("stock_reservations", { variant_id: v, quantity: 3, order_id: o.id, session_id: `s-${t}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${t}`, p_signature: "sig", p_source: "test", p_amount_paise: null });

    // Fulfillment: confirm actual batch, packing QC, freeze shipment provenance
    await confirmPickBatch(ed, { orderItemId: oi.id, batchId: b, qty: 3 });
    await recordPackingQc(ed, o.id, PASS);
    const sh = await ins("shipments", { order_id: o.id, status: "pending", provider: "manual" });
    expect((await confirmShipmentProvenance(ed, sh.id)).frozenLines).toBe(1);
    expect((await sel(`/shipment_batch_lines?order_id=eq.${o.id}&select=batch_id,qty`))[0].batch_id).toBe(b);

    // Labels: eligible batch → retail label with the immutable code
    const lab = await generateLabel(ed, { batchId: b, templateId: (await listLabelTemplates({ purpose: "retail" }))[0].id, quantity: 1 });
    expect(lab.encodedValue).toBe((await sel(`/manufacturing_batches?id=eq.${b}&select=batch_code`))[0].batch_code);

    // Return 1 → restocks to the actual (shipped) batch b
    const rr = await ins("returns", { order_id: o.id, order_number: `E2E-${t}`, rma_number: `RMA-E2E-${RUNK}-${nn++}`, status: "received", resolution: "return_required" });
    await ins("return_items", { return_id: rr.id, order_item_id: oi.id, variant_id: v, sku: "T", product_name: "T", quantity: 1, line_amount: 100, restock: true });
    expect((await receiveReturnGoods(rr.id, [{ variantId: v, received: 1, restockable: 1, damaged: 0 }], { actorId: ed.userId })).restocked).toBe(1);
    expect((await sel(`/batch_stock_entries?source_id=eq.${o.id}&entry_type=eq.return_restock&select=batch_id`))[0].batch_id).toBe(b);
    expect((await variantReconciliation(v)).fully_reconciled).toBe(true);

    // Recall: contain the batch → new eligibility is blocked; retail label refused
    const rc = await createRecallCase(sup, { kind: "recall", reason: "e2e safety" }); await addRecallBatches(sup, rc.recallId!, [b]); await transitionRecall(sup, rc.recallId!, "initiated");
    expect((await sel(`/manufacturing_batches?id=eq.${b}&select=recall_state`))[0].recall_state).toBe("recalled");
    await expect(generateLabel(ed, { batchId: b, templateId: (await listLabelTemplates({ purpose: "retail" }))[0].id, quantity: 1 })).rejects.toThrow(/recalled|eligible/i);
    // conservation still holds after the whole chain
    const r = await variantReconciliation(v);
    expect(r.overlay_ledger_drift).toBe(0); expect(r.accounting_explained).toBe(true);
  });
});
