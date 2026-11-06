import { describe, it, expect, beforeAll } from "vitest";

/** Phase 4 — QC & batch lifecycle. LOCAL Supabase only. NON-STOCK. */
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

import { createBatch, updateBatch, getBatch, getBatchTimeline, type StaffActor } from "@/services/manufacturing/batchService";
import { ForbiddenError } from "@/services/manufacturing/actor";
import { upsertTemplate, listTemplates, recordRoutineQc, recordDesignValidation, revokeDesignValidation, designValidationStatus, listQcForBatch } from "@/services/manufacturing/qcService";
import { toInProduction, toCuring, toQualityCheck, approveQc, rejectBatch, reopenBatch, advanceLifecycle, setHold } from "@/services/manufacturing/lifecycleService";

const RUNK = Date.now().toString(36).slice(-5);
let admin: StaffActor, inspector: StaffActor, approver: StaffActor, sodApprover: StaffActor, adminOverride: StaffActor;
let productId = "", variantId = "", prefix = "";
const PAST = "2026-01-01", FUTURE = "2027-06-01";

// Create a candle batch and drive it to quality_check with produced=pending=qty.
async function batchAtQC(key: string, qty: number, earliest: string, candle?: Record<string, unknown>): Promise<string> {
  const { batchId } = await createBatch(admin, { variantId, idempotencyKey: `${key}-${RUNK}`, manufacturingDate: "2026-12-08", plannedQty: qty, earliestReleaseDate: earliest, candle });
  await updateBatch(admin, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await toInProduction(admin, batchId);
  await toCuring(admin, batchId);
  await toQualityCheck(admin, batchId);
  return batchId;
}

d("Manufacturing Phase 4 (QC & lifecycle)", () => {
  beforeAll(async () => {
    const users = await sel("/users?select=id&limit=5");
    const ids: string[] = (users ?? []).map((u: any) => u.id);
    admin = { userId: ids[0], role: "admin" };
    inspector = { userId: ids[1] ?? ids[0], role: "editor" };
    approver = { userId: ids[2] ?? ids[1] ?? ids[0], role: "manager" };
    sodApprover = { userId: inspector.userId, role: "manager" };       // same person who inspected
    adminOverride = { userId: inspector.userId, role: "admin" };        // authorised SoD override
    // ISOLATION (Phase 12A): create a DEDICATED disposable candle product + variant in a unique
    // batch-code namespace. Never depends on an arbitrary existing real product, and never touches
    // the real catalogue/stock — so batch codes are unique and deterministic within this suite's scope
    // (the duplicate-batch_code collisions came from sharing a real product's accumulated sequence).
    const cat = (await sel("/categories?select=id&limit=1"))[0];
    prefix = ("Q" + RUNK).toUpperCase().slice(0, 6);           // unique per run; varchar(6)
    const p = await ins("products", { name: `QCLC ${RUNK}`, slug: `qclc-${RUNK}`, base_sku: `QCLC-${RUNK}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: prefix });
    const v = await ins("variants", { product_id: p.id, sku: `QCLC-${RUNK}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "190g", variant_name: "Glass 190g", is_active: false });
    productId = p.id; variantId = v.id;
  });

  it("versions QC templates immutably", async () => {
    const pt = `candle-${RUNK}`;
    const v1 = await upsertTemplate(admin, { productType: pt, requiredChecks: ["fill_weight"], name: "v1" });
    const v2 = await upsertTemplate(admin, { productType: pt, requiredChecks: ["fill_weight", "wick_centering"], name: "v2" });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    const all = (await listTemplates(pt)).filter((t: any) => t.product_type === pt);
    expect(all.length).toBe(2);
    expect(all.find((t: any) => t.version === 1).name).toBe("v1"); // history unchanged
  });

  it("enforces required checks before a QC record is accepted", async () => {
    const pt = `reqd-${RUNK}`;
    const tpl = await upsertTemplate(admin, { productType: pt, requiredChecks: ["fill_weight", "wick_centering"] });
    const batchId = await batchAtQC("REQ", 5, PAST);
    // A PASS missing a required check is rejected…
    await expect(recordRoutineQc(inspector, { batchId, templateId: tpl.templateId, inspectedQty: 0, approvedDelta: 0, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 190 } })).rejects.toThrow();
    // …but a non-pass result may carry incomplete checks (that is what conditional/fail are for).
    const cond = await recordRoutineQc(inspector, { batchId, templateId: tpl.templateId, inspectedQty: 0, approvedDelta: 0, rejectedDelta: 0, result: "conditional", measurements: { fill_weight: 190 } });
    expect(cond.qcId).toBeTruthy();
    const ok = await recordRoutineQc(inspector, { batchId, templateId: tpl.templateId, inspectedQty: 5, approvedDelta: 5, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 190, wick_centering: "ok" } });
    expect(ok.qcId).toBeTruthy();
  });

  it("reconciles QC quantities, stores measurements, and dedupes duplicate submissions", async () => {
    const batchId = await batchAtQC("RECON", 10, PAST);
    const key = `QCK-${RUNK}`;
    await recordRoutineQc(inspector, { batchId, inspectedQty: 4, approvedDelta: 4, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 189 }, idempotencyKey: key });
    const dup = await recordRoutineQc(inspector, { batchId, inspectedQty: 4, approvedDelta: 4, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 189 }, idempotencyKey: key });
    expect(dup.idempotent).toBe(true); // no double count
    let row = await getBatch(batchId);
    expect([row.pending_inspection_qty, row.approved_qty]).toEqual([6, 4]);
    // conditional + destructive sample + rejection across a second inspection
    await recordRoutineQc(inspector, { batchId, inspectedQty: 6, approvedDelta: 4, rejectedDelta: 1, sampledDestroyedDelta: 1, result: "conditional", measurements: { soot: "light" } });
    row = await getBatch(batchId);
    expect([row.pending_inspection_qty, row.approved_qty, row.rejected_qty, row.qc_sampled_destroyed_qty]).toEqual([0, 8, 1, 1]);
    expect(row.produced_qty).toBe(10); // conservation: 10 = 8+1+1+0
    const checks = await listQcForBatch(batchId);
    expect(checks.length).toBe(2);
    expect(checks[0].measurements.fill_weight).toBe(189); // actual measurements stored, not just a flag
  });

  it("applies concurrent QC inspections without double counting", async () => {
    const batchId = await batchAtQC("CONC", 10, PAST);
    await Promise.all([
      recordRoutineQc(inspector, { batchId, inspectedQty: 5, approvedDelta: 5, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 }, idempotencyKey: `CC1-${RUNK}` }),
      recordRoutineQc(inspector, { batchId, inspectedQty: 5, approvedDelta: 5, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 2 }, idempotencyKey: `CC2-${RUNK}` }),
    ]);
    const row = await getBatch(batchId);
    expect([row.pending_inspection_qty, row.approved_qty]).toEqual([0, 10]);
  });

  it("drives the full lifecycle to qc_approved and records the timeline", async () => {
    const batchId = await batchAtQC("HAPPY", 5, PAST);
    await recordRoutineQc(inspector, { batchId, inspectedQty: 5, approvedDelta: 5, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 190 } });
    const r = await approveQc(approver, batchId); // approver ≠ inspector, cure past, passing QC
    expect(r.to).toBe("qc_approved");
    const row = await getBatch(batchId);
    expect(row.lifecycle_status).toBe("qc_approved");
    expect(row.approved_by).toBe(approver.userId);
    const states = (await getBatchTimeline(batchId)).map((t: any) => t.to_state);
    expect(states).toEqual(["draft", "in_production", "curing", "quality_check", "qc_approved"]);
  });

  it("rejects illegal transitions and un-cured approval", async () => {
    const draftId = (await createBatch(admin, { variantId, idempotencyKey: `ILL-${RUNK}`, manufacturingDate: "2026-12-08", plannedQty: 1, earliestReleaseDate: PAST })).batchId;
    await expect(advanceLifecycle(admin, draftId, "qc_approved")).rejects.toThrow(); // draft → qc_approved illegal
    // cure not complete
    const future = await batchAtQC("CURE", 2, FUTURE);
    await recordRoutineQc(inspector, { batchId: future, inspectedQty: 2, approvedDelta: 2, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 } });
    await expect(approveQc(approver, future)).rejects.toThrow(); // cure not complete
  });

  it("enforces QC-approval authorization and separation of duties (with audited override)", async () => {
    const batchId = await batchAtQC("SOD", 3, PAST);
    await recordRoutineQc(inspector, { batchId, inspectedQty: 3, approvedDelta: 3, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 } });
    await expect(approveQc(inspector, batchId)).rejects.toBeInstanceOf(ForbiddenError); // editor lacks qc_approve
    await expect(approveQc(sodApprover, batchId)).rejects.toThrow(); // manager == inspector → SoD violation
    const r = await approveQc(adminOverride, batchId, { overrideReason: "small team; approved by owner" });
    expect(r.sodOverride).toBe(true); // authorised, audited override
    expect(r.to).toBe("qc_approved");
  });

  it("keeps design burn-validation distinct and config-specific (no auto-validation of a changed config)", async () => {
    const spec = { wick_spec: "ECO-10", vessel_spec: "GL190", fill_weight_target_g: 190, fragrance_load_pct: 8 };
    const a = await createBatch(admin, { variantId, idempotencyKey: `DV-A-${RUNK}`, manufacturingDate: "2026-12-08", plannedQty: 1, candle: spec });
    const dv = await recordDesignValidation(inspector, { batchId: a.batchId, result: "pass", measurements: { flame: "stable", melt_pool: "full", soot: "none", mushrooming: "slight", vessel_temp_c: 48, burn_hours: 4, safe_remaining_wax_mm: 10 } });
    expect(dv.configFingerprint).toBeTruthy();
    expect((await designValidationStatus(a.batchId)).validated).toBe(true);
    // A new batch with the SAME configuration is covered by the validation (config-level).
    const b = await createBatch(admin, { variantId, idempotencyKey: `DV-B-${RUNK}`, manufacturingDate: "2026-12-08", plannedQty: 1, candle: spec });
    expect((await designValidationStatus(b.batchId)).validated).toBe(true);
    // Change the configuration → the prior validation no longer applies.
    await updateBatch(admin, { batchId: b.batchId, candle: { wick_spec: "ECO-12" } });
    expect((await designValidationStatus(b.batchId)).validated).toBe(false);
  });

  it("evaluates acceptance criteria — numeric limits, categorical, and critical safety", async () => {
    const pt = `crit-${RUNK}`;
    const tpl = await upsertTemplate(admin, { productType: pt, requiredChecks: [
      { key: "fill_weight", min: 185, max: 200, mandatory: true, critical: false },
      { key: "wick_centering", allowed: ["centered"], mandatory: true, critical: true },
    ] });
    const batchId = await batchAtQC("CRIT", 10, PAST);
    const base = { batchId, templateId: tpl.templateId, inspectedQty: 1, approvedDelta: 1, rejectedDelta: 0 } as const;
    // Numeric out of range (mandatory, non-critical) → cannot pass without an exception.
    await expect(recordRoutineQc(inspector, { ...base, result: "pass", measurements: { fill_weight: 210, wick_centering: "centered" } })).rejects.toThrow();
    // Categorical CRITICAL failure → cannot pass even with an approver's exception.
    await expect(recordRoutineQc(approver, { ...base, result: "pass", measurements: { fill_weight: 190, wick_centering: "off" }, exceptionReason: "owner ok" })).rejects.toThrow();
    // Mandatory non-critical failure + an APPROVER's audited exception → allowed.
    const exc = await recordRoutineQc(approver, { ...base, result: "pass", measurements: { fill_weight: 210, wick_centering: "centered" }, exceptionReason: "measured by hand; within tolerance" });
    expect(exc.qcId).toBeTruthy();
    // An editor (no qc_approve) cannot invoke the exception → still blocked.
    await expect(recordRoutineQc(inspector, { ...base, result: "pass", measurements: { fill_weight: 210, wick_centering: "centered" }, exceptionReason: "try" })).rejects.toThrow();
    // All within criteria → clean pass.
    const ok = await recordRoutineQc(inspector, { ...base, result: "pass", measurements: { fill_weight: 190, wick_centering: "centered" } });
    expect(ok.qcId).toBeTruthy();
  });

  it("blocks qc_approved when inspection is incomplete or nothing is approved", async () => {
    const batchId = await batchAtQC("ELIG", 10, PAST);
    await recordRoutineQc(inspector, { batchId, inspectedQty: 4, approvedDelta: 4, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 } });
    await expect(approveQc(approver, batchId)).rejects.toThrow(); // 6 still pending → not eligible
    await recordRoutineQc(inspector, { batchId, inspectedQty: 6, approvedDelta: 0, rejectedDelta: 6, result: "fail", measurements: { fill_weight: 1 } });
    // Now fully inspected AND a passing QC exists AND approved_qty=4>0 → eligible.
    expect((await approveQc(approver, batchId)).to).toBe("qc_approved");
  });

  it("invalidates the prior approval on reopen and requires qc_approve + a reason", async () => {
    const batchId = await batchAtQC("REOPEN", 3, PAST);
    await recordRoutineQc(inspector, { batchId, inspectedQty: 3, approvedDelta: 3, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 } });
    await approveQc(approver, batchId);
    // A lower 'quality_check' move can't silently reopen an approved batch.
    await expect(toQualityCheck(inspector, batchId)).rejects.toThrow();
    // Reopen needs qc_approve + a reason.
    await expect(reopenBatch(inspector, batchId, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reopenBatch(approver, batchId, "")).rejects.toThrow();
    const r = await reopenBatch(approver, batchId, "fill-weight drift found post-approval");
    expect(r.qcRevision).toBe(1);
    const row = await getBatch(batchId);
    expect(row.lifecycle_status).toBe("quality_check");
    expect(row.approved_by).toBeNull(); // stale approval invalidated
  });

  it("stops a revoked design validation from qualifying a batch", async () => {
    const spec = { wick_spec: "RV-1", vessel_spec: "GL190", fill_weight_target_g: 190 };
    const a = await createBatch(admin, { variantId, idempotencyKey: `RV-${RUNK}`, manufacturingDate: "2026-12-08", plannedQty: 1, candle: spec });
    const dv = await recordDesignValidation(inspector, { batchId: a.batchId, result: "pass", measurements: { flame: "stable" } });
    expect((await designValidationStatus(a.batchId)).validated).toBe(true);
    await revokeDesignValidation(approver, dv.validationId, "lab error in burn rig");
    expect((await designValidationStatus(a.batchId)).validated).toBe(false);
  });

  it("supports hold and resume (recall_state) without recalling", async () => {
    const batchId = await batchAtQC("HOLD", 2, PAST);
    expect(await setHold(approver, batchId, true, "supplier query")).toBe("on_hold");
    await recordRoutineQc(inspector, { batchId, inspectedQty: 2, approvedDelta: 2, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 1 } });
    await expect(approveQc(approver, batchId)).rejects.toThrow(); // can't approve while on hold
    expect(await setHold(approver, batchId, false)).toBe("none");
    expect((await approveQc(approver, batchId)).to).toBe("qc_approved");
  });

  it("batch-code sequence: monotonic & unique, survives >99 exhaustion, and a collision is surfaced not reused", async () => {
    // Generator is PREFIX-FORMAT-YYMMDD-SEQ with a monotonic per-scope counter (batch_code_sequences).
    const gp = ("Z" + RUNK).toUpperCase().slice(0, 6), fmt = "TST", date = "2026-12-08", scope = `${gp}-${fmt}-261208`;
    const gen = async () => (await rpc("generate_batch_code", { p_prefix: gp, p_format: fmt, p_date: date })).body as string;
    const c1 = await gen(), c2 = await gen(), c3 = await gen();
    expect([c1, c2, c3]).toEqual([`${scope}-01`, `${scope}-02`, `${scope}-03`]); // deterministic, monotonic
    expect(new Set([c1, c2, c3]).size).toBe(3);                                   // unique

    // Exhaustion past the 2-digit pad: seed the counter to 98 → next codes 99, 100 (3 digits, still unique).
    await patch(`/batch_code_sequences?scope_key=eq.${scope}`, { last_seq: 98 });
    const c99 = await gen(), c100 = await gen();
    expect(c99).toBe(`${scope}-99`);
    expect(c100).toBe(`${scope}-100`);                                            // no wraparound/truncation
    expect(c99).not.toBe(c100);

    // Collision handling: the batch_code unique constraint SURFACES a duplicate (never silently reused).
    const dupCode = `${gp}-DUP-261208-01`;
    await ins("manufacturing_batches", { variant_id: variantId, product_id: productId, batch_kind: "legacy", lifecycle_status: "released", batch_code: dupCode, sku_snapshot: "QCLC" });
    const second = await fetch(rest(`/manufacturing_batches`), { method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ variant_id: variantId, product_id: productId, batch_kind: "legacy", lifecycle_status: "released", batch_code: dupCode, sku_snapshot: "QCLC" }) });
    expect(second.status).toBeGreaterThanOrEqual(400);                            // duplicate rejected, not reused
    expect((await second.json().catch(() => ({})) as any)?.code).toBe("23505");   // unique_violation
  });
});
