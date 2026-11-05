/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 9 — recall / hold case management + containment + traceability. INERT (acts on batches; no live
 * tracked variant). Containment reuses manufacturing_batches.recall_state (every gate already enforces it),
 * so applying a recall blocks release/allocation/picking/substitution/shipment/dispatch and routes returned
 * recalled units to quarantine — without touching variants.stock or batch_allocations history. All mutations
 * gated by manufacturing.recall (admin+); affected-customer reads are internal/service-role only.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient() as unknown as { from: (t: string) => any };

export interface CreateRecallInput { kind: "manufacturing_hold" | "recall"; reason: string; severity?: "low" | "medium" | "high" | "critical"; evidence?: unknown; requiredActions?: unknown }

export async function createRecallCase(actor: StaffActor, input: CreateRecallInput): Promise<{ ok: boolean; recallId?: string; recallNumber?: string }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("create_recall_case", { p: { kind: input.kind, reason: input.reason, severity: input.severity, evidence: input.evidence ?? null, required_actions: input.requiredActions ?? null, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: r?.recall_id, event: "recall.created", actorType: "staff", actorId: actor.userId, notes: input.reason, metadata: { kind: input.kind, recall_number: r?.recall_number } });
  return { ok: !!r?.ok, recallId: r?.recall_id, recallNumber: r?.recall_number };
}

export async function addRecallBatches(actor: StaffActor, recallId: string, batchIds: string[]): Promise<{ added: number; stamped: boolean }> {
  assertCap(actor, "manufacturing.recall");
  // RPC inserts membership AND fail-closes (stamps recall_state) immediately if the case is already active.
  const r = await callRpc<any>("add_recall_batches", { p: { recall_id: recallId, batch_ids: batchIds } });
  return { added: r?.added ?? 0, stamped: !!r?.stamped };
}

/** Controlled expansion: add newly-discovered lot-consuming batches to the case (fail-closed if active). */
export async function expandRecallBatches(actor: StaffActor, recallId: string): Promise<{ added: number }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("expand_recall_batches", { p: { recall_id: recallId, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: recallId, event: "recall.expanded", actorType: "staff", actorId: actor.userId, metadata: { added: r?.added } });
  return { added: r?.added ?? 0 };
}

/** Explicit, authorised return-to-eligibility — refused while ANY open case still covers the batch. */
export async function releaseBatchContainment(actor: StaffActor, batchId: string, reason: string): Promise<{ ok: boolean }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("release_batch_containment", { p: { batch_id: batchId, reason, actor_id: actor.userId } });
  await logEvent({ entityType: "batch", entityId: batchId, event: "recall.batch_released", actorType: "staff", actorId: actor.userId, notes: reason });
  return { ok: !!r?.ok };
}

export async function addRecallLots(actor: StaffActor, recallId: string, lotIds: string[]): Promise<void> {
  assertCap(actor, "manufacturing.recall");
  const { error } = await db().from("recall_case_lots").upsert(lotIds.map((material_lot_id) => ({ recall_id: recallId, material_lot_id })), { onConflict: "recall_id,material_lot_id", ignoreDuplicates: true });
  if (error) throw new Error(`addRecallLots: ${error.message}`);
}

export async function transitionRecall(actor: StaffActor, recallId: string, toState: string, opts?: { closureDecision?: string; investigationNotes?: string; notes?: string }): Promise<{ ok: boolean; status?: string }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("recall_case_transition", { p: { recall_id: recallId, to_state: toState, closure_decision: opts?.closureDecision, investigation_notes: opts?.investigationNotes, notes: opts?.notes, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: recallId, event: `recall.${toState}`, actorType: "staff", actorId: actor.userId, notes: opts?.notes });
  return { ok: !!r?.ok, status: r?.status };
}

/** Apply physical containment — set recall_state on every case batch; every stock gate then enforces it. */
export async function applyContainment(actor: StaffActor, recallId: string): Promise<{ ok: boolean; batches?: number; recallState?: string }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("apply_recall_containment", { p: { recall_id: recallId, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: recallId, event: "recall.containment_applied", actorType: "staff", actorId: actor.userId, metadata: { batches: r?.batches, recall_state: r?.recall_state } });
  return { ok: !!r?.ok, batches: r?.batches, recallState: r?.recall_state };
}

export async function listRecalls(opts?: { openOnly?: boolean }): Promise<any[]> {
  let q = db().from("recall_cases").select("*").order("created_at", { ascending: false });
  if (opts?.openOnly) q = q.not("status", "in", "(closed,cancelled)");
  const { data } = await q;
  return data ?? [];
}

// ── Traceability (reads). batchMaterialLots / materialLotBatches / accounting are non-PII. ──
export async function batchMaterialLots(batchId: string): Promise<any[]> { return (await callRpc<any>("batch_material_lots", { p_batch_id: batchId })) ?? []; }
export async function materialLotBatches(lotId: string): Promise<any[]> { return (await callRpc<any>("material_lot_batches", { p_lot_id: lotId })) ?? []; }
export async function batchRecallAccounting(batchId: string): Promise<any> { return callRpc<any>("batch_recall_accounting", { p_batch_id: batchId }); }

/** Affected orders for a batch (actual-shipped / picked / logical-only, distinguished). */
export async function batchAffectedOrders(actor: StaffActor, batchId: string): Promise<any[]> {
  assertCap(actor, "manufacturing.recall");
  return (await callRpc<any>("batch_affected_orders", { p_batch_id: batchId })) ?? [];
}
export async function lotAffectedOrders(actor: StaffActor, lotId: string): Promise<any[]> {
  assertCap(actor, "manufacturing.recall");
  return (await callRpc<any>("lot_affected_orders", { p_lot_id: lotId })) ?? [];
}

/** Per-order shipment-state classification for a batch (logical/picked/packed/shipment_created/dispatched/in_transit/delivered/rto/returned/unknown). */
export async function batchRecallImpact(actor: StaffActor, batchId: string): Promise<any[]> {
  assertCap(actor, "manufacturing.recall");
  return (await callRpc<any>("batch_recall_impact", { p_batch_id: batchId })) ?? [];
}

/** Build/refresh the reviewable affected-customer contact list from ACTUAL provenance. NEVER sends. */
export async function prepareRecallNotifications(actor: StaffActor, recallId: string): Promise<{ ok: boolean; prepared?: number }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("prepare_recall_notifications", { p: { recall_id: recallId } });
  await logEvent({ entityType: "settings", entityId: recallId, event: "recall.notifications_prepared", actorType: "staff", actorId: actor.userId, metadata: { prepared: r?.prepared, dispatch_enabled: false } });
  return { ok: !!r?.ok, prepared: r?.prepared };
}

export async function listRecallNotifications(actor: StaffActor, recallId: string): Promise<any[]> {
  assertCap(actor, "manufacturing.recall");
  const { data } = await db().from("recall_notifications").select("*").eq("recall_id", recallId).order("created_at");
  return data ?? [];
}

/** Record an operator decision on a prepared contact (necessity/approval). NO external dispatch here. */
export async function reviewRecallNotification(actor: StaffActor, id: string, patch: { necessity?: string; approvalStatus?: string; needsFollowup?: boolean }): Promise<void> {
  assertCap(actor, "manufacturing.recall");
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.necessity) upd.necessity = patch.necessity;
  if (patch.approvalStatus) upd.approval_status = patch.approvalStatus;
  if (patch.needsFollowup !== undefined) upd.needs_followup = patch.needsFollowup;
  await db().from("recall_notifications").update(upd).eq("id", id);
  await logEvent({ entityType: "settings", entityId: id, event: "recall.notification_reviewed", actorType: "staff", actorId: actor.userId, metadata: patch });
}

/** Affected customers for a batch — PERSONAL DATA; manufacturing.recall only. Joins orders for contact. */
export async function batchAffectedCustomers(actor: StaffActor, batchId: string): Promise<any[]> {
  assertCap(actor, "manufacturing.recall");
  const affected = await batchAffectedOrders(actor, batchId);
  const ids = [...new Set(affected.map((a) => a.order_id))];
  if (!ids.length) return [];
  const { data } = await db().from("orders").select("id,order_number,email,ship_full_name,status").in("id", ids);
  const byId = new Map((data ?? []).map((o: any) => [o.id, o]));
  return affected.map((a) => ({ ...a, customer: byId.get(a.order_id) ?? null }));
}
