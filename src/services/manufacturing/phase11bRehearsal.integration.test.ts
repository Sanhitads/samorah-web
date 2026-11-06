import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 11B — activation rehearsal (service path; disposable tracked fixtures; cleaned at end).
 * Adds the scenarios NOT already proven by the phase-7A/8/9/10 suites:
 *   • fail-closed PAUSE + forward recovery: allocation disabled while a variant is tracked makes a paid
 *     order fail to finalize (no untagged consumption); payment/order preserved; re-enabling + re-running
 *     finalize recovers idempotently — WITHOUT a database restore and WITHOUT fabricating provenance.
 *   • concurrent manual-adjustment + order finalisation serialise with conservation intact.
 *   • invalid legacy classification (open exception / synthetic write-off) keeps activation_eligible=false.
 *   • the HAZARD of an unsafe tracked→untracked flip (why it must never be automated).
 *   • an INDEPENDENT conservation recompute (from raw ledger/overlay, not variant_batch_reconciliation).
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
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = "P11B" + Date.now().toString(36).slice(-4);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor; let n = 0;

async function makeVariant(): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${n++}`;
  const p = await ins("products", { name: `P11B ${t}`, slug: `p11b-${t}`.toLowerCase(), base_sku: `P11B-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `P11B-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(sup, v.id, "tracked");
  return v.id;
}
async function makeUntrackedWithStock(qty: number): Promise<string> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${n++}`;
  const p = await ins("products", { name: `P11B ${t}`, slug: `p11b-${t}`.toLowerCase(), base_sku: `P11B-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `P11B-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", tracking_state: "untracked", is_active: false });
  await rpc("adjust_inventory", { p: { variant_id: v.id, mode: "set", qty, reason: "Physical count correction" } });
  return v.id;
}
async function releasedBatch(variantId: string, qty: number): Promise<string> {
  const { batchId } = await createBatch(mgr, { variantId, idempotencyKey: `PBB-${RUNK}-${Math.random()}`, manufacturingDate: "2026-10-01", plannedQty: qty, earliestReleaseDate: "2026-10-10" });
  await updateBatch(mgr, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(mgr, batchId); await toCuring(mgr, batchId); await toQualityCheck(mgr, batchId);
  await recordRoutineQc(ed, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(ed, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(mgr, batchId);
  await releaseBatch(mgr, { batchId, qty, idempotencyKey: `PBR-${RUNK}-${Math.random()}` });
  return batchId;
}
async function seedPaidPending(variantId: string, qty: number): Promise<{ orderId: string; roid: string; tag: string }> {
  const tag = `${RUNK}-${n++}`; const roid = `rzp_${tag}`;
  const o = await ins("orders", { order_number: `P11B-${tag}`, email: "r@example.test", status: "pending", payment_status: "pending", total_amount: qty * 100, razorpay_order_id: roid, ship_full_name: "R" });
  await ins("order_items", { order_id: o.id, variant_id: variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: qty, line_subtotal: qty * 100, line_total: qty * 100 });
  await ins("stock_reservations", { variant_id: variantId, quantity: qty, order_id: o.id, session_id: `s-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { orderId: o.id, roid, tag };
}
const finalize = (roid: string, tag: string, src = "test") => rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: src, p_amount_paise: null });

/** INDEPENDENT conservation: recomputed from raw ledger + overlay, NOT from variant_batch_reconciliation. */
async function conserve(variantId: string) {
  const mv = await sel(`/inventory_movements?variant_ref=eq.${variantId}&select=quantity_delta`);
  const ledger = mv.reduce((a: number, m: any) => a + m.quantity_delta, 0);
  const ov = await sel(`/batch_stock_entries?variant_id=eq.${variantId}&select=qty`);
  const overlay = ov.reduce((a: number, e: any) => a + e.qty, 0);
  const v = (await sel(`/variants?id=eq.${variantId}&select=stock,tracking_state`))[0];
  return { aggregate: v.stock, ledger, overlay, tracked: v.tracking_state === "tracked",
           aggregateEqLedger: v.stock === ledger, physicalConsistent: v.stock === overlay, nonNegative: v.stock >= 0 };
}

d("Phase 11B — activation rehearsal (service path)", () => {
  const made: string[] = [];
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
  });
  afterAll(async () => { if (RUN) { await setReleaseEnabled(sup, false); await setAllocationEnabled(sup, false); } });

  it("PAUSE+RECOVERY: allocation OFF makes a tracked paid order fail CLOSED; re-enabling recovers idempotently", async () => {
    const v = await makeVariant(); made.push(v); await releasedBatch(v, 5);
    const { orderId, roid, tag } = await seedPaidPending(v, 2);

    // Emergency pause: disable allocation while the variant stays tracked.
    await setAllocationEnabled(sup, false);
    const failed = await finalize(roid, tag);
    expect(failed.status).toBeGreaterThanOrEqual(400);                 // fail CLOSED — no untagged consumption
    const oMid = (await sel(`/orders?id=eq.${orderId}&select=status,payment_status,idempotency_key`))[0];
    expect(oMid.status).toBe("pending");                               // order preserved, not finalized
    expect(oMid.idempotency_key).toBeNull();
    expect((await sel(`/inventory_movements?source_id=eq.${orderId}&select=id`)).length).toBe(0); // nothing posted
    expect((await sel(`/stock_reservations?order_id=eq.${orderId}&select=id`)).length).toBe(1);   // reservation intact
    const cMid = await conserve(v);
    expect(cMid.aggregate).toBe(5); expect(cMid.physicalConsistent).toBe(true); // released stock untouched

    // Forward recovery: re-enable allocation, re-run the SAME finalize (idempotent, no restore, no fabrication).
    await setAllocationEnabled(sup, true);
    const ok = await finalize(roid, tag, "recovery");
    expect(ok.status).toBe(200); expect(ok.body.created).toBe(true);
    const oDone = (await sel(`/orders?id=eq.${orderId}&select=status`))[0];
    expect(oDone.status).toBe("confirmed");
    expect((await sel(`/batch_stock_entries?source_id=eq.${orderId}&entry_type=eq.sale&select=qty`)).reduce((a: number, e: any) => a + e.qty, 0)).toBe(-2);
    const rec = await variantReconciliation(v); expect(rec.fully_reconciled).toBe(true);
    const c = await conserve(v);
    expect(c.aggregate).toBe(3); expect(c.aggregateEqLedger).toBe(true); expect(c.physicalConsistent).toBe(true);
  });

  it("PAUSE+RECOVERY (no ELIGIBLE batch): recovery resolves to a DURABLE exception, never invented stock", async () => {
    const v = await makeVariant(); made.push(v); const b = await releasedBatch(v, 3); // aggregate stock 3...
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "config recall", actor_id: mgr.userId } }); // ...but batch now INELIGIBLE
    const { orderId, roid, tag } = await seedPaidPending(v, 3);
    await setAllocationEnabled(sup, false);
    expect((await finalize(roid, tag)).status).toBeGreaterThanOrEqual(400); // fail closed (no attribution, no exception)
    await setAllocationEnabled(sup, true);
    const ok = await finalize(roid, tag, "recovery");
    expect(ok.body.created).toBe(true);                                // payment finalised on recovery
    const exc = await sel(`/order_inventory_exceptions?order_id=eq.${orderId}&select=shortfall_qty,state`);
    expect(exc.length).toBe(1); expect(exc[0].shortfall_qty).toBe(3);  // durable shortfall — nothing fabricated
    const rec = await variantReconciliation(v);
    expect(rec.accounting_explained).toBe(true); expect(rec.fully_reconciled).toBe(false);
  });

  it("CONCURRENT manual adjustment + order finalisation serialise; conservation intact", async () => {
    const v = await makeVariant(); made.push(v); const b = await releasedBatch(v, 10);
    const { roid, tag } = await seedPaidPending(v, 3);
    const [adj, fin] = await Promise.all([
      rpc("adjust_batch_inventory", { p: { variant_id: v, batch_id: b, mode: "remove", qty: 2, reason: "Damaged on floor", actor_id: mgr.userId } }),
      finalize(roid, tag),
    ]);
    expect(adj.status).toBe(200); expect(fin.body.created).toBe(true);
    const c = await conserve(v);
    expect(c.aggregate).toBe(5);                        // 10 − 2 adjust − 3 sale
    expect(c.aggregateEqLedger).toBe(true); expect(c.physicalConsistent).toBe(true); expect(c.nonNegative).toBe(true);
    expect((await variantReconciliation(v)).fully_reconciled).toBe(true);
  });

  it("INVALID legacy classification: an open exception / synthetic write-off keeps activation_eligible=false", async () => {
    const v = await makeVariant(); made.push(v); const b = await releasedBatch(v, 2);
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "config recall", actor_id: mgr.userId } });
    const { tag, roid } = await seedPaidPending(v, 2);
    await finalize(roid, tag);                                          // creates a durable open exception
    const rec = await variantReconciliation(v);
    expect(rec.open_exception_qty).toBe(2);
    expect(rec.activation_eligible).toBe(false);                       // cannot be considered activation-ready
  });

  it("ONE-WAY: tracked→untracked is REFUSED by the DB guard (tracking history is permanent)", async () => {
    const v = await makeVariant(); made.push(v); await releasedBatch(v, 5);
    expect((await conserve(v)).physicalConsistent).toBe(true);
    // The Phase-12A guard blocks deactivation (which would otherwise strand the batch overlay / permit
    // untagged consumption). Pausing is done via the release/allocation switches, never by deactivation.
    await expect(setVariantTracking(sup, v, "untracked")).rejects.toThrow(/one-way|not permitted|tracked/i);
    // State and conservation are unchanged — the variant is still tracked and consistent.
    expect((await sel(`/variants?id=eq.${v}&select=tracking_state`))[0].tracking_state).toBe("tracked");
    expect((await conserve(v)).physicalConsistent).toBe(true);
  });

  it("GUARD: a non-empty variant cannot be activated without an opening cutover + sign-off", async () => {
    // Seed real untracked aggregate stock, then attempt activation with no batch overlay / sign-off.
    const vu = await makeUntrackedWithStock(6);
    await expect(setVariantTracking(sup, vu, "tracked")).rejects.toThrow(/opening|consistent|eligible|reconcil/i);
    expect((await sel(`/variants?id=eq.${vu}&select=tracking_state`))[0].tracking_state).toBe("untracked");
  });
});
