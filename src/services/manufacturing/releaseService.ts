/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Batch inventory release (Phase 6B) — INERT. The ONLY path that posts a batch release.
 * Delegates to the release_batch RPC, which reuses apply_stock_movement as the sole
 * aggregate stock writer, enforces QC/validation/hold/balance eligibility, idempotency,
 * and per-batch attribution atomically. Release is refused unless the variant is
 * 'tracked' (no live variant is) and the global release switch is on — so this is
 * inert in production. Capability: manufacturing.release (manager+).
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export interface ReleaseInput { batchId: string; qty: number; idempotencyKey: string }
export interface ReleaseResult { created: boolean; idempotent: boolean; eventId: string; movementId: string | null; releasedQty: number; totalReleased?: number; approvedQty?: number }

export async function releaseBatch(actor: StaffActor, input: ReleaseInput): Promise<ReleaseResult> {
  assertCap(actor, "manufacturing.release");
  if (!input.batchId || !input.idempotencyKey) throw new Error("batchId and idempotencyKey are required.");
  const r = await callRpc<any>("release_batch", { p: { batch_id: input.batchId, qty: input.qty, idempotency_key: input.idempotencyKey, actor_id: actor.userId } });
  const out: ReleaseResult = { created: !!r.created, idempotent: !!r.idempotent, eventId: r.event_id, movementId: r.movement_id ?? null, releasedQty: r.released_qty, totalReleased: r.total_released, approvedQty: r.approved_qty };
  if (out.created) {
    await logEvent({ entityType: "batch", entityId: input.batchId, event: "batch.released", actorType: "staff", actorId: actor.userId, notes: `released ${out.releasedQty}`, metadata: { event_id: out.eventId, movement_id: out.movementId } });
  }
  return out;
}

/** Release ledger summary for a batch (approved / released / remaining / on-hand). */
export async function releaseSummary(batchId: string): Promise<{ approved: number; released: number; remaining: number; onhand: number }> {
  const batch = (await db().from("manufacturing_batches").select("approved_qty").eq("id", batchId).maybeSingle()).data as any;
  const events = (await db().from("batch_release_events").select("qty").eq("batch_id", batchId)).data as any[] | null;
  const onhand = await callRpc<number>("batch_onhand", { p_batch_id: batchId });
  const approved = batch?.approved_qty ?? 0;
  const released = (events ?? []).reduce((n, e) => n + (e.qty ?? 0), 0);
  return { approved, released, remaining: Math.max(approved - released, 0), onhand: onhand ?? 0 };
}

/** Variant conservation report (aggregate vs batch overlay) — drift must be 0. */
export async function variantReconciliation(variantId: string): Promise<any> {
  return callRpc<any>("variant_batch_reconciliation", { p_variant_id: variantId });
}
