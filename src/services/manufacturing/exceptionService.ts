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
