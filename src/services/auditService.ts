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
export type AuditEntity = "order" | "shipment" | "fulfillment" | "return" | "exception" | "payment" | "settings" | "rule";

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

export interface AuditFeedRow extends AuditEvent {
  orderNumber: string | null;
  actorName: string | null;
}

/** Recent audit events across the platform (newest first) — the activity feed.
 *  Resolves order numbers + staff names so the feed reads in plain language. */
export async function getRecentAuditEvents(opts: { limit?: number; event?: string } = {}): Promise<AuditFeedRow[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let q = db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.event) q = q.eq("event", opts.event);
    const { data } = await q;
    const events = (data ?? []) as AuditEvent[] & { order_id?: string | null }[];

    const orderIds = [...new Set(events.map((e) => (e as { order_id?: string }).order_id).filter(Boolean))];
    const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))];
    const orderMap = new Map<string, string>();
    const actorMap = new Map<string, string>();
    if (orderIds.length) {
      const { data: os } = await db.from("orders").select("id,order_number").in("id", orderIds);
      for (const o of os ?? []) orderMap.set(o.id, o.order_number);
    }
    if (actorIds.length) {
      const { data: us } = await db.from("users").select("id,full_name").in("id", actorIds);
      for (const u of us ?? []) actorMap.set(u.id, u.full_name ?? "");
    }
    return events.map((e) => ({
      ...e,
      orderNumber: (e as { order_id?: string }).order_id ? orderMap.get((e as { order_id?: string }).order_id as string) ?? null : null,
      actorName: e.actor_id ? actorMap.get(e.actor_id) ?? null : null,
    }));
  } catch {
    return [];
  }
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
