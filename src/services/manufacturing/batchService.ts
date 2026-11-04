/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Manufacturing batch service (Phase 3) — identity + production records ONLY.
 * NON-STOCK: nothing here moves inventory, releases batches, or touches orders.
 * Writes go through SECURITY DEFINER RPCs (create_batch / update_batch /
 * start_batch_production); every write asserts a capability and records the
 * server-derived actor. Reads use the service-role PostgREST client (admin pages
 * read via the server, not the user session — RLS Pattern #1).
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

export type { StaffActor } from "@/services/manufacturing/actor";
export { ForbiddenError } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export interface CandleSpecInput {
  wax_formula_code?: string; wax_formula_version?: string;
  fragrance_formula_code?: string; fragrance_formula_version?: string;
  wax_qty?: number; fragrance_qty?: number; fragrance_load_pct?: number;
  wick_spec?: string; vessel_spec?: string;
  fill_weight_target_g?: number; fill_weight_actual_g?: number;
  fragrance_add_temp_c?: number; pour_temp_c?: number;
  operator_id?: string; deviations?: string; formula_snapshot?: unknown;
}
export interface CreateBatchInput {
  variantId: string;
  idempotencyKey: string; // required — makes creation safe against retries
  manufacturingDate?: string; // ISO date; defaults to today (IST) server-side
  plannedQty?: number;
  notes?: string;
  cureStartDate?: string;
  earliestReleaseDate?: string;
  candle?: CandleSpecInput;
}
export interface UpdateBatchInput {
  batchId: string;
  plannedQty?: number; producedQty?: number; pendingInspectionQty?: number;
  approvedQty?: number; rejectedQty?: number; qcSampledDestroyedQty?: number;
  productionStartedAt?: string; productionCompletedAt?: string;
  cureStartDate?: string; earliestReleaseDate?: string; notes?: string;
  candle?: CandleSpecInput;
}
export interface CreateBatchResult { created: boolean; batchId: string; batchCode: string; productionSequence: number }

/** Set a product's stable, immutable batch-code prefix (required before its first batch). */
export async function setProductBatchPrefix(actor: StaffActor, productId: string, prefix: string): Promise<void> {
  assertCap(actor, "manufacturing.operate");
  const clean = (prefix || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(clean)) throw new Error("batch_prefix must be 1–6 letters/digits.");
  const { error } = await db().from("products").update({ batch_prefix: clean }).eq("id", productId);
  if (error) throw new Error(error.message);
  await logEvent({ entityType: "product", entityId: productId, event: "product.batch_prefix_set", actorType: "staff", actorId: actor.userId, notes: clean });
}

export async function createBatch(actor: StaffActor, input: CreateBatchInput): Promise<CreateBatchResult> {
  assertCap(actor, "manufacturing.operate");
  if (!input.variantId || !input.idempotencyKey) throw new Error("variantId and idempotencyKey are required.");
  const res = await callRpc<any>("create_batch", {
    p: {
      variant_id: input.variantId,
      idempotency_key: input.idempotencyKey,
      manufacturing_date: input.manufacturingDate ?? "",
      planned_qty: input.plannedQty ?? 0,
      notes: input.notes ?? "",
      cure_start_date: input.cureStartDate ?? "",
      earliest_release_date: input.earliestReleaseDate ?? "",
      candle: input.candle ?? null,
      actor_id: actor.userId,
    },
  });
  const out: CreateBatchResult = { created: !!res.created, batchId: res.batch_id, batchCode: res.batch_code, productionSequence: res.production_sequence };
  if (out.created) {
    await logEvent({ entityType: "batch", entityId: out.batchId, event: "batch.created", actorType: "staff", actorId: actor.userId, newState: "draft", notes: out.batchCode });
  }
  return out;
}

const QTY_KEYS = ["planned_qty", "produced_qty", "pending_inspection_qty", "approved_qty", "rejected_qty", "qc_sampled_destroyed_qty"] as const;

export async function updateBatch(actor: StaffActor, input: UpdateBatchInput): Promise<void> {
  assertCap(actor, "manufacturing.operate");
  if (!input.batchId) throw new Error("batchId is required.");
  // Snapshot before-state so the audit trail records the correction (not just that one happened).
  const before = await getBatch(input.batchId);
  await callRpc<any>("update_batch", {
    p: {
      batch_id: input.batchId,
      planned_qty: input.plannedQty, produced_qty: input.producedQty, pending_inspection_qty: input.pendingInspectionQty,
      approved_qty: input.approvedQty, rejected_qty: input.rejectedQty, qc_sampled_destroyed_qty: input.qcSampledDestroyedQty,
      production_started_at: input.productionStartedAt ?? "", production_completed_at: input.productionCompletedAt ?? "",
      cure_start_date: input.cureStartDate ?? "", earliest_release_date: input.earliestReleaseDate ?? "",
      notes: input.notes, candle: input.candle ?? null, actor_id: actor.userId,
    },
  });
  const after = await getBatch(input.batchId);
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  if (before && after) for (const k of QTY_KEYS) if (before[k] !== after[k]) changed[k] = { from: before[k], to: after[k] };
  await logEvent({ entityType: "batch", entityId: input.batchId, event: "batch.updated", actorType: "staff", actorId: actor.userId, metadata: { changed } });
}

export async function startProduction(actor: StaffActor, batchId: string): Promise<void> {
  assertCap(actor, "manufacturing.operate");
  await callRpc<any>("start_batch_production", { p: { batch_id: batchId, actor_id: actor.userId } });
  await logEvent({ entityType: "batch", entityId: batchId, event: "batch.production_started", actorType: "staff", actorId: actor.userId, newState: "in_production" });
}

// ── Reads (service-role) ──────────────────────────────────────────────────────
export async function getBatch(batchId: string): Promise<any | null> {
  const { data } = await db().from("manufacturing_batches").select("*").eq("id", batchId).maybeSingle();
  return data ?? null;
}
export async function getBatchWithSpec(batchId: string): Promise<any | null> {
  const { data } = await db().from("manufacturing_batches").select("*, batch_candle_spec(*)").eq("id", batchId).maybeSingle();
  return data ?? null;
}
export async function listBatches(opts: { variantId?: string; limit?: number } = {}): Promise<any[]> {
  let q = db().from("manufacturing_batches").select("id,batch_code,variant_id,lifecycle_status,recall_state,manufacturing_date,planned_qty,produced_qty,approved_qty,created_at").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.variantId) q = q.eq("variant_id", opts.variantId);
  const { data } = await q;
  return data ?? [];
}
export async function getBatchTimeline(batchId: string): Promise<any[]> {
  const { data } = await db().from("batch_status_history").select("*").eq("batch_id", batchId).order("created_at", { ascending: true });
  return data ?? [];
}
