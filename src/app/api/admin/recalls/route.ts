import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import type { Capability } from "@/lib/auth/capabilities";
import type { StaffActor } from "@/services/manufacturing/actor";
import { ForbiddenError } from "@/services/manufacturing/actor";
import {
  createRecallCase, addRecallBatches, addRecallBatchesByCode, listRecallCaseBatches, addRecallLots, expandRecallBatches, transitionRecall,
  applyContainment, releaseBatchContainment, listRecalls, batchMaterialLots, materialLotBatches,
  batchRecallAccounting, batchRecallImpact, batchAffectedOrders, lotAffectedOrders, batchAffectedCustomers,
  prepareRecallNotifications, listRecallNotifications, reviewRecallNotification,
} from "@/services/manufacturing/recallService";

/**
 * POST /api/admin/recalls — Recall Admin Console operations. Every action needs manufacturing.recall
 * (admin+); the actor is taken from the authenticated session, NEVER the body. Customer PII (affected
 * customers) is behind the same capability and NOT exposed by generic manufacturing endpoints. No external
 * notification is ever dispatched here — the notification workflow only prepares/records a reviewable list.
 */
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (b: any, actor: StaffActor) => Promise<unknown>;
const CAP: Capability = "manufacturing.recall";
const ACTIONS: Record<string, Handler> = {
  list:                 (b) => listRecalls({ openOnly: !!b.openOnly }),
  create:               (b, a) => createRecallCase(a, { kind: b.kind, reason: b.reason, severity: b.severity, evidence: b.evidence, requiredActions: b.requiredActions }),
  add_batches:          (b, a) => addRecallBatches(a, String(b.recallId), b.batchIds ?? []),
  add_batches_by_code:  (b, a) => addRecallBatchesByCode(a, String(b.recallId), Array.isArray(b.codes) ? b.codes : String(b.codes ?? "").split(",")),
  case_batches:         (b) => listRecallCaseBatches(String(b.recallId)),
  add_lots:             (b, a) => addRecallLots(a, String(b.recallId), b.lotIds ?? []),
  expand:               (b, a) => expandRecallBatches(a, String(b.recallId)),
  transition:           (b, a) => transitionRecall(a, String(b.recallId), String(b.toState), { closureDecision: b.closureDecision, investigationNotes: b.investigationNotes, notes: b.notes }),
  apply_containment:    (b, a) => applyContainment(a, String(b.recallId)),
  release_batch:        (b, a) => releaseBatchContainment(a, String(b.batchId), String(b.reason ?? "")),
  batch_lots:           (b) => batchMaterialLots(String(b.batchId)),
  lot_batches:          (b) => materialLotBatches(String(b.lotId)),
  accounting:           (b) => batchRecallAccounting(String(b.batchId)),
  impact:               (b, a) => batchRecallImpact(a, String(b.batchId)),
  affected_orders:      (b, a) => batchAffectedOrders(a, String(b.batchId)),
  lot_affected_orders:  (b, a) => lotAffectedOrders(a, String(b.lotId)),
  affected_customers:   (b, a) => batchAffectedCustomers(a, String(b.batchId)),   // PERSONAL DATA — recall role only
  prepare_notifications:(b, a) => prepareRecallNotifications(a, String(b.recallId)),
  list_notifications:   (b, a) => listRecallNotifications(a, String(b.recallId)),
  review_notification:  (b, a) => reviewRecallNotification(a, String(b.id), { necessity: b.necessity, approvalStatus: b.approvalStatus, needsFollowup: b.needsFollowup }).then(() => ({ ok: true })),
};

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  const run = ACTIONS[body?.action];
  if (!run) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  const staff = await requireCapability(CAP);
  if (!staff.ok || !staff.userId) return NextResponse.json({ ok: false, error: `Forbidden — needs the ${CAP} capability.` }, { status: 403 });

  try {
    const result = await run(body, { userId: staff.userId, role: staff.role ?? "" });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    const msg = e instanceof Error ? e.message : "Request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
