import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 6B — INERT batch release machinery. LOCAL Supabase only. Uses DISPOSABLE,
 * explicitly test-only tracked variants; never touches live catalog tracking_state.
 * Verifies reconciliation (drift = 0) after every stock-changing step.
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

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc, reopenBatch, setHold } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation, revokeDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch, releaseSummary, variantReconciliation } from "@/services/manufacturing/releaseService";
import { ForbiddenError, type StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let inspector: StaffActor, manager: StaffActor, editor: StaffActor;
let variantId = "", untrackedVariantId = "", productId = "";

async function makeProductVariant(tracked: boolean): Promise<{ productId: string; variantId: string }> {
  const cat = (await sel("/categories?select=id&limit=1"))?.[0];
  const tag = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6); // unique per product
  const p = await ins("products", { name: `REL ${tag}`, slug: `rel-${tag}`, base_sku: `REL-${tag}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  const v = await ins("variants", { product_id: p.id, sku: `REL-${tag}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: tracked ? "tracked" : "untracked", tracked_at: tracked ? new Date(Date.now() - 60000).toISOString() : null, is_active: false });
  return { productId: p.id, variantId: v.id };
}

/** Create a batch and drive it to qc_approved with an approved design validation. */
async function approvedBatch(qty: number, vId = variantId): Promise<string> {
  const { batchId } = await createBatch(manager, { variantId: vId, idempotencyKey: `B-${RUNK}-${Math.random()}`, manufacturingDate: "2026-10-01", plannedQty: qty, earliestReleaseDate: "2026-10-10" });
  await updateBatch(manager, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(manager, batchId);
  await toCuring(manager, batchId);
  await toQualityCheck(manager, batchId);
  await recordRoutineQc(inspector, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(inspector, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(manager, batchId); // manager ≠ inspector → SoD ok
  return batchId;
}
const drift = async (v = variantId) => (await variantReconciliation(v)).overlay_ledger_drift;

d("Phase 6B — batch release (inert)", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    inspector = { userId: us[0].id, role: "editor" };
    manager = { userId: us[1]?.id ?? us[0].id, role: "manager" };
    editor = { userId: us[0].id, role: "editor" };
    ({ productId, variantId } = await makeProductVariant(true));
    ({ variantId: untrackedVariantId } = await makeProductVariant(false));
    await patch("/manufacturing_settings?id=eq.true", { release_enabled: true });
  });

  it("1-2. first release posts one movement + overlay; same-key retry is a no-op; reconciliation holds", async () => {
    const b = await approvedBatch(20);
    const key = `REL1-${RUNK}`;
    const r1 = await releaseBatch(manager, { batchId: b, qty: 5, idempotencyKey: key });
    expect(r1.created).toBe(true); expect(r1.releasedQty).toBe(5); expect(r1.movementId).toBeTruthy();
    expect(await drift()).toBe(0);
    const r2 = await releaseBatch(manager, { batchId: b, qty: 5, idempotencyKey: key });
    expect(r2.idempotent).toBe(true); expect(r2.eventId).toBe(r1.eventId);
    expect((await releaseSummary(b)).released).toBe(5); // not double-counted
    expect(await drift()).toBe(0);
  });

  it("3-4. conflicting-key rejected; retry-after-hold returns original; new release on held batch rejected", async () => {
    const b = await approvedBatch(10);
    const key = `REL2-${RUNK}`;
    await releaseBatch(manager, { batchId: b, qty: 3, idempotencyKey: key });
    await expect(releaseBatch(manager, { batchId: b, qty: 7, idempotencyKey: key })).rejects.toThrow(); // conflict
    await setHold(manager, b, true, "quarantine check");
    const retry = await releaseBatch(manager, { batchId: b, qty: 3, idempotencyKey: key }); // original key, post-hold
    expect(retry.idempotent).toBe(true); // returned without re-evaluating hold
    await expect(releaseBatch(manager, { batchId: b, qty: 1, idempotencyKey: `new-${RUNK}` })).rejects.toThrow(); // held → blocked
  });

  it("5-7. partial + concurrent releases accumulate; over-approved is rejected and leaves no partial state", async () => {
    const b = await approvedBatch(20);
    await releaseBatch(manager, { batchId: b, qty: 5, idempotencyKey: `P1-${RUNK}` });
    const [a, c] = await Promise.all([
      releaseBatch(manager, { batchId: b, qty: 4, idempotencyKey: `P2-${RUNK}` }),
      releaseBatch(manager, { batchId: b, qty: 4, idempotencyKey: `P3-${RUNK}` }),
    ]);
    expect(a.created && c.created).toBe(true);
    expect((await releaseSummary(b)).released).toBe(13);
    const before = (await sel(`/batch_release_events?batch_id=eq.${b}&select=id`)).length;
    await expect(releaseBatch(manager, { batchId: b, qty: 100, idempotencyKey: `P4-${RUNK}` })).rejects.toThrow(); // > approved
    const after = (await sel(`/batch_release_events?batch_id=eq.${b}&select=id`)).length;
    expect(after).toBe(before); // rolled back — no partial event
    expect(await drift()).toBe(0);
  });

  it("8-9,12. invalid QC (reopen) and revoked design validation block release", async () => {
    const b = await approvedBatch(6);
    await reopenBatch(manager, b, "re-inspect"); // invalidates approval
    await expect(releaseBatch(manager, { batchId: b, qty: 1, idempotencyKey: `RE-${RUNK}` })).rejects.toThrow();

    const b2 = await approvedBatch(6);
    const dvs = await sel(`/batch_design_validations?batch_id=eq.${b2}&select=id&state=eq.approved`);
    await revokeDesignValidation(manager, dvs[0].id, "lab rig fault");
    await expect(releaseBatch(manager, { batchId: b2, qty: 1, idempotencyKey: `RV-${RUNK}` })).rejects.toThrow();
  });

  it("13-15,17. DB attribution invariants: wrong-variant, duplicate overlay, sign mismatch, per-batch non-negative", async () => {
    const b = await approvedBatch(5);
    await releaseBatch(manager, { batchId: b, qty: 2, idempotencyKey: `INV-${RUNK}` });
    const mv = (await sel(`/inventory_movements?source_id=eq.${b}&movement_type=eq.batch_release&select=id,variant_ref&limit=1`))[0];
    // wrong-variant attribution
    let r = await fetch(rest("/batch_stock_entries"), { method: "POST", headers: H, body: JSON.stringify({ batch_id: b, variant_id: untrackedVariantId, entry_type: "release", qty: 1, movement_id: mv.id }) });
    expect(r.ok).toBe(false);
    // duplicate (movement_id, batch_id)
    r = await fetch(rest("/batch_stock_entries"), { method: "POST", headers: H, body: JSON.stringify({ batch_id: b, variant_id: variantId, entry_type: "release", qty: 1, movement_id: mv.id }) });
    expect(r.ok).toBe(false);
    // sign mismatch vs the (positive) movement
    r = await fetch(rest("/batch_stock_entries"), { method: "POST", headers: H, body: JSON.stringify({ batch_id: b, variant_id: variantId, entry_type: "sale", qty: -1, movement_id: mv.id }) });
    expect(r.ok).toBe(false);
    // per-batch non-negative (movement-less negative overlay driving the batch below 0)
    r = await fetch(rest("/batch_stock_entries"), { method: "POST", headers: H, body: JSON.stringify({ batch_id: b, variant_id: variantId, entry_type: "writeoff", qty: -999 }) });
    expect(r.ok).toBe(false);
  });

  it("18-19. untracked variant stays inert; reconciliation drift is 0 for tracked and untracked", async () => {
    const ub = await approvedBatch(4, untrackedVariantId);
    await expect(releaseBatch(manager, { batchId: ub, qty: 1, idempotencyKey: `UT-${RUNK}` })).rejects.toThrow(/tracked/i);
    expect(await drift(untrackedVariantId)).toBe(0);
    expect(await drift(variantId)).toBe(0);
  });

  it("20. emergency disable fails closed; authorization enforced", async () => {
    const b = await approvedBatch(4);
    await patch("/manufacturing_settings?id=eq.true", { release_enabled: false });
    await expect(releaseBatch(manager, { batchId: b, qty: 1, idempotencyKey: `ED-${RUNK}` })).rejects.toThrow(/disabled/i);
    await patch("/manufacturing_settings?id=eq.true", { release_enabled: true });
    await expect(releaseBatch(editor, { batchId: b, qty: 1, idempotencyKey: `AU-${RUNK}` })).rejects.toBeInstanceOf(ForbiddenError); // editor lacks manufacturing.release
  });
});
