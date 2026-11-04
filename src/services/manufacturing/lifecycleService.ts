/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Manufacturing batch lifecycle (Phase 4) — controlled transitions:
 *   draft → in_production → curing → quality_check → qc_approved
 * plus rework (quality_check → in_production), re-open (qc_approved → quality_check),
 * rejection, and hold/resume (recall_state). QC approval is DISTINCT from the later
 * inventory release; the release/closed states are NOT reachable here. NON-STOCK.
 *
 * Capability is enforced per target state (production floor vs QC vs QC-approval).
 * Separation of duties is enforced in the RPC; an authorised override requires an
 * explicit reason AND manufacturing.recall (admin), and is audited.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { logEvent } from "@/services/auditService";
import { hasCapability, type Capability } from "@/lib/auth/capabilities";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

export type LifecycleTarget = "in_production" | "curing" | "quality_check" | "qc_approved" | "rejected";

function capFor(target: LifecycleTarget): Capability {
  switch (target) {
    case "in_production":
    case "curing":
      return "manufacturing.operate";
    case "quality_check":
      return "manufacturing.qc";
    case "qc_approved":
    case "rejected":
      return "manufacturing.qc_approve";
  }
}

export async function advanceLifecycle(
  actor: StaffActor,
  batchId: string,
  toStatus: LifecycleTarget,
  opts: { reason?: string; overrideReason?: string } = {},
): Promise<{ from: string; to: string; sodOverride: boolean }> {
  assertCap(actor, capFor(toStatus));
  // An SoD override is honoured only when the actor is authorised (admin) AND gives a reason.
  const allowOverride = !!opts.overrideReason && hasCapability(actor.role, "manufacturing.recall");
  const res = await callRpc<any>("advance_batch_lifecycle", {
    p: {
      batch_id: batchId, to_status: toStatus, actor_id: actor.userId,
      reason: opts.overrideReason ?? opts.reason ?? "", allow_sod_override: allowOverride,
    },
  });
  await logEvent({
    entityType: "batch", entityId: batchId, event: `batch.lifecycle.${toStatus}`, actorType: "staff", actorId: actor.userId,
    previousState: res.from, newState: res.to, metadata: res.sod_override ? { sod_override: true, reason: opts.overrideReason } : undefined,
  });
  return { from: res.from, to: res.to, sodOverride: !!res.sod_override };
}

export const toInProduction = (a: StaffActor, id: string, reason?: string) => advanceLifecycle(a, id, "in_production", { reason });
export const toCuring = (a: StaffActor, id: string, reason?: string) => advanceLifecycle(a, id, "curing", { reason });
export const toQualityCheck = (a: StaffActor, id: string, reason?: string) => advanceLifecycle(a, id, "quality_check", { reason });
export const approveQc = (a: StaffActor, id: string, opts: { overrideReason?: string } = {}) => advanceLifecycle(a, id, "qc_approved", opts);

export async function rejectBatch(a: StaffActor, id: string, reason: string): Promise<{ from: string; to: string }> {
  if (!reason?.trim()) throw new Error("A reason is required to reject a batch.");
  return advanceLifecycle(a, id, "rejected", { reason });
}

/** Reopen a QC-approved batch for rework/re-inspection. Requires manufacturing.qc_approve
 *  and a reason; the RPC invalidates the prior approval and bumps qc_revision so a stale
 *  approval can never authorise a later release. */
export async function reopenBatch(a: StaffActor, id: string, reason: string): Promise<{ qcRevision: number }> {
  assertCap(a, "manufacturing.qc_approve");
  if (!reason?.trim()) throw new Error("A reason is required to reopen a batch.");
  const res = await callRpc<any>("advance_batch_lifecycle", {
    p: { batch_id: id, to_status: "quality_check", reason, allow_reopen: true, actor_id: a.userId },
  });
  await logEvent({ entityType: "batch", entityId: id, event: "batch.reopened", actorType: "staff", actorId: a.userId, previousState: res.from, newState: res.to, notes: reason, metadata: { qc_revision: res.qc_revision } });
  return { qcRevision: res.qc_revision };
}

export async function setHold(actor: StaffActor, batchId: string, hold: boolean, reason?: string): Promise<string> {
  assertCap(actor, "manufacturing.qc_approve");
  const res = await callRpc<any>("set_batch_hold", { p: { batch_id: batchId, hold, reason: reason ?? "", actor_id: actor.userId } });
  await logEvent({ entityType: "batch", entityId: batchId, event: hold ? "batch.hold" : "batch.resume", actorType: "staff", actorId: actor.userId, newState: res.recall_state, notes: reason });
  return res.recall_state as string;
}
