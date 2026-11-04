import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import type { Capability } from "@/lib/auth/capabilities";
import type { StaffActor } from "@/services/manufacturing/actor";
import { ForbiddenError } from "@/services/manufacturing/actor";
import { createBatch, updateBatch, startProduction, setProductBatchPrefix } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc, rejectBatch, reopenBatch, setHold } from "@/services/manufacturing/lifecycleService";
import { upsertTemplate, recordRoutineQc, recordDesignValidation, revokeDesignValidation } from "@/services/manufacturing/qcService";
import { registerMaterial, registerMaterialLot, recordConsumption } from "@/services/manufacturing/materialService";

/**
 * POST /api/admin/manufacturing — all manufacturing mutations (Phase 5).
 * Server-authoritative: each action declares the capability it needs; the actor identity
 * is taken from the authenticated session (requireCapability), NEVER from the request body.
 * All business logic lives in the manufacturing services — this route only gates + dispatches.
 * NON-STOCK: no action here releases inventory, allocates to orders, or moves variants.stock.
 */
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (b: any, actor: StaffActor) => Promise<unknown>;
const ACTIONS: Record<string, { cap: Capability; run: Handler }> = {
  set_prefix:        { cap: "manufacturing.operate",   run: (b, a) => setProductBatchPrefix(a, String(b.productId), String(b.prefix)) },
  create_batch:      { cap: "manufacturing.operate",   run: (b, a) => createBatch(a, b.input) },
  update_batch:      { cap: "manufacturing.operate",   run: (b, a) => updateBatch(a, b.input) },
  start_production:  { cap: "manufacturing.operate",   run: (b, a) => startProduction(a, String(b.batchId)) },
  to_curing:         { cap: "manufacturing.operate",   run: (b, a) => toCuring(a, String(b.batchId), b.reason) },
  to_quality_check:  { cap: "manufacturing.qc",        run: (b, a) => toQualityCheck(a, String(b.batchId), b.reason) },
  record_qc:         { cap: "manufacturing.qc",        run: (b, a) => recordRoutineQc(a, b.input) },
  record_design_validation: { cap: "manufacturing.qc", run: (b, a) => recordDesignValidation(a, b.input) },
  upsert_template:   { cap: "manufacturing.qc",        run: (b, a) => upsertTemplate(a, b.input) },
  approve:           { cap: "manufacturing.qc_approve", run: (b, a) => approveQc(a, String(b.batchId), { overrideReason: b.overrideReason }) },
  reject:            { cap: "manufacturing.qc_approve", run: (b, a) => rejectBatch(a, String(b.batchId), String(b.reason ?? "")) },
  reopen:            { cap: "manufacturing.qc_approve", run: (b, a) => reopenBatch(a, String(b.batchId), String(b.reason ?? "")) },
  hold:              { cap: "manufacturing.qc_approve", run: (b, a) => setHold(a, String(b.batchId), true, b.reason) },
  resume:            { cap: "manufacturing.qc_approve", run: (b, a) => setHold(a, String(b.batchId), false, b.reason) },
  revoke_design_validation: { cap: "manufacturing.qc_approve", run: (b, a) => revokeDesignValidation(a, String(b.validationId), String(b.reason ?? "")) },
  register_material: { cap: "manufacturing.operate",   run: (b, a) => registerMaterial(a, b.input) },
  register_lot:      { cap: "manufacturing.operate",   run: (b, a) => registerMaterialLot(a, b.input) },
  record_consumption:{ cap: "manufacturing.operate",   run: (b, a) => recordConsumption(a, b.input) },
};

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  const spec = ACTIONS[body?.action];
  if (!spec) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  const staff = await requireCapability(spec.cap);
  if (!staff.ok || !staff.userId) return NextResponse.json({ ok: false, error: `Forbidden — needs the ${spec.cap} capability.` }, { status: 403 });

  try {
    const result = await spec.run(body, { userId: staff.userId, role: staff.role ?? "" });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    const msg = e instanceof Error ? e.message : "Request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
