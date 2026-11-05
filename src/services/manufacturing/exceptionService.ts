/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Order inventory exceptions (Phase 7B-1) — durable, idempotent records for orders whose
 * payment was captured but whose tracked-stock allocation could not fully complete. The order
 * stays PAID (financial reconciliation intact) but is NOT marked fully allocated, so normal
 * fulfilment must treat an open exception as a block. Resolution is a controlled, audited state
 * machine (reallocate after release, or refund via the existing refund workflow). Gated by
 * manufacturing.recall (admin+). This is an overlay on the existing order/payment model — NOT a
 * second payment state machine.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export type ExceptionState = "pending_reallocation" | "refund_required" | "refund_initiated" | "resolved_allocated" | "resolved_refunded";

export async function listOpenExceptions(): Promise<any[]> {
  const { data } = await db().from("order_inventory_exceptions")
    .select("*").not("state", "in", "(resolved_allocated,resolved_refunded)").order("created_at", { ascending: true });
  return data ?? [];
}

export async function getOrderExceptions(orderId: string): Promise<any[]> {
  const { data } = await db().from("order_inventory_exceptions").select("*").eq("order_id", orderId);
  return data ?? [];
}

export async function resolveException(actor: StaffActor, exceptionId: string, toState: ExceptionState, reason?: string): Promise<void> {
  assertCap(actor, "manufacturing.recall");
  await callRpc<any>("resolve_order_inventory_exception", { p: { exception_id: exceptionId, to_state: toState, reason: reason ?? "", actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: exceptionId, event: `inventory.exception.${toState}`, actorType: "staff", actorId: actor.userId, notes: reason });
}

/**
 * STOCK recovery: repair a paid shortfall by attributing newly-eligible batch stock (FIFO) to the
 * exception's sale movement. Resolves to `resolved_allocated` only if the full shortfall is covered;
 * otherwise it stays open with the reduced remaining. Creates NO new stock — it is attribution repair.
 */
export async function reallocateException(actor: StaffActor, exceptionId: string): Promise<{ ok: boolean; resolved?: boolean; remaining?: number }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("reallocate_order_exception", { p: { exception_id: exceptionId, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: exceptionId, event: r?.resolved ? "inventory.exception.resolved_allocated" : "inventory.exception.pending_reallocation", actorType: "staff", actorId: actor.userId, metadata: { remaining: r?.remaining ?? 0 } });
  return { ok: !!r?.ok, resolved: !!r?.resolved, remaining: r?.remaining };
}

/**
 * REFUND recovery (Part D): resolve a shortfall against confirmed refund evidence in the refunds
 * ledger (the financial truth — no second ledger). Issues NO positive inventory movement: a shortfall's
 * units were never deducted. `processed` refund ⇒ resolved_refunded (fulfilment unblocks); any other
 * non-failed status ⇒ refund_initiated (stays open/blocked); a failed refund is rejected as evidence.
 */
export async function resolveExceptionByRefund(actor: StaffActor, exceptionId: string, refundId: string, reason?: string): Promise<{ ok: boolean; state?: string; refundStatus?: string }> {
  assertCap(actor, "manufacturing.recall");
  const r = await callRpc<any>("resolve_exception_by_refund", { p: { exception_id: exceptionId, refund_id: refundId, actor_id: actor.userId, reason: reason ?? "" } });
  await logEvent({ entityType: "settings", entityId: exceptionId, event: `inventory.exception.${r?.state ?? "refund"}`, actorType: "staff", actorId: actor.userId, notes: reason, metadata: { refund_id: refundId, refund_status: r?.refund_status } });
  return { ok: !!r?.ok, state: r?.state, refundStatus: r?.refund_status };
}

/** Durable pending batch-attribution holds (received, resale-eligible, not yet sellable) — for operator triage. */
export async function listReceiptHolds(opts?: { variantId?: string; openOnly?: boolean }): Promise<any[]> {
  let q = db().from("batch_receipt_holds").select("*").order("created_at", { ascending: true });
  if (opts?.variantId) q = q.eq("variant_id", opts.variantId);
  if (opts?.openOnly !== false) q = q.eq("state", "held");
  const { data } = await q;
  return data ?? [];
}
