/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Audit-Event Log (Design Principles d · 18 · 22) — the single immutable stream all
 * business actions write to. `logEvent` is NON-BLOCKING: an audit failure must never
 * break the underlying action. `getOrderTimeline` reads an order's events (powers
 * "View Timeline" + Analytics).
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActorType = "staff" | "customer" | "system" | "webhook";
export type AuditEntity = "order" | "shipment" | "fulfillment" | "return" | "exception" | "payment";

export interface AuditEventInput {
  orderId?: string;
  entityType: AuditEntity;
  entityId?: string;
  event: string; // e.g. fulfillment.picking · shipment.created · order.confirmed
  actorType?: ActorType;
  actorId?: string;
  previousState?: string;
  newState?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function logEvent(input: AuditEventInput): Promise<void> {
  try {
    await callRpc<void>("record_audit_event", {
      p: {
        order_id: input.orderId ?? "",
        entity_type: input.entityType,
        entity_id: input.entityId ?? "",
        event: input.event,
        actor_type: input.actorType ?? (input.actorId ? "staff" : "system"),
        actor_id: input.actorId ?? "",
        previous_state: input.previousState ?? "",
        new_state: input.newState ?? "",
        notes: input.notes ?? "",
        metadata: input.metadata ?? null,
      },
    });
  } catch (e) {
    console.error("logEvent failed (non-fatal)", e);
  }
}

export interface AuditEvent {
  id: string;
  event: string;
  entity_type: string;
  actor_type: string;
  actor_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** An order's event timeline, oldest first. */
export async function getOrderTimeline(orderId: string): Promise<AuditEvent[]> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any };
    const { data } = await db.from("audit_events").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    return (data ?? []) as AuditEvent[];
  } catch {
    return [];
  }
}
