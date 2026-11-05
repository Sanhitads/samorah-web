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

export async function addRecallBatches(actor: StaffActor, recallId: string, batchIds: string[]): Promise<void> {
  assertCap(actor, "manufacturing.recall");
  // variant_id is backfilled from the batch for affected-order convenience.
  const { data: batches } = await db().from("manufacturing_batches").select("id,variant_id").in("id", batchIds);
  const vmap = new Map((batches ?? []).map((b: any) => [b.id, b.variant_id]));
  const rows = batchIds.map((batch_id) => ({ recall_id: recallId, batch_id, variant_id: vmap.get(batch_id) ?? null }));
  const { error } = await db().from("recall_case_batches").upsert(rows, { onConflict: "recall_id,batch_id", ignoreDuplicates: true });
  if (error) throw new Error(`addRecallBatches: ${error.message}`);
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
