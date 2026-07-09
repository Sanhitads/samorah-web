/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fulfillment service (Module 1 / point M) — drives an order through the physical
 * warehouse workflow (pick → pack → QC → ready → dispatch) via the fulfillment state
 * machine, syncing the coarse order status. Provider-agnostic; the dashboard calls
 * these. `null` fulfillment_status is treated as the start state `reserved`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertFulfillmentTransition,
  fulfillmentToOrderStatus,
  nextFulfillmentStates,
  type FulfillmentStatus,
} from "@/lib/fulfillment/state";
import { logEvent } from "@/services/auditService";

const START: FulfillmentStatus = "reserved";
const TERMINAL_ORDER = new Set(["cancelled", "delivered", "returned", "rto"]);

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/** Advance an order's fulfillment status (guarded) and sync the coarse order status. */
export async function advanceFulfillment(
  orderNumber: string,
  to: FulfillmentStatus,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; from: FulfillmentStatus; to: FulfillmentStatus }> {
  const db = loose();
  const { data: order } = await db
    .from("orders")
    .select("id,fulfillment_status,status")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) throw new Error("order not found");
  const from = (order.fulfillment_status ?? START) as FulfillmentStatus;
  assertFulfillmentTransition(from, to);

  const patch: Record<string, unknown> = { fulfillment_status: to, updated_at: new Date().toISOString() };
  const mapped = fulfillmentToOrderStatus(to);
  if (mapped && mapped !== order.status) patch.status = mapped;
  await db.from("orders").update(patch).eq("id", order.id);
  await logEvent({ orderId: order.id, entityType: "fulfillment", entityId: order.id, event: `fulfillment.${to}`, actorId: opts?.actorId, previousState: from, newState: to });
  return { ok: true, from, to };
}

/** Best-effort advance — used alongside shipment actions; ignores illegal jumps
 *  (e.g. an order that was auto-shipped without the manual workflow). */
export async function tryAdvanceFulfillment(orderNumber: string, to: FulfillmentStatus, opts?: { actorId?: string }): Promise<void> {
  try {
    await advanceFulfillment(orderNumber, to, opts);
  } catch {
    /* not on the expected path — leave fulfillment status as-is */
  }
}

/** Put an order on hold, remembering the exact prior state + an optional reason. */
export async function holdFulfillment(orderNumber: string, reason?: string, opts?: { actorId?: string }): Promise<{ ok: boolean; from: FulfillmentStatus }> {
  const db = loose();
  const { data: order } = await db.from("orders").select("id,fulfillment_status").eq("order_number", orderNumber).maybeSingle();
  if (!order) throw new Error("order not found");
  const from = (order.fulfillment_status ?? START) as FulfillmentStatus;
  if (from === "on_hold") return { ok: true, from };
  assertFulfillmentTransition(from, "on_hold");
  await db
    .from("orders")
    .update({
      fulfillment_status: "on_hold",
      fulfillment_prev_status: from,
      fulfillment_hold_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  await logEvent({ orderId: order.id, entityType: "fulfillment", entityId: order.id, event: "fulfillment.on_hold", actorId: opts?.actorId, previousState: from, newState: "on_hold", notes: reason?.trim() || undefined });
  return { ok: true, from };
}

/** Resume a held order to its exact prior state; syncs the coarse order status. */
export async function resumeFulfillment(orderNumber: string, opts?: { actorId?: string }): Promise<{ ok: boolean; to: FulfillmentStatus }> {
  const db = loose();
  const { data: order } = await db
    .from("orders")
    .select("id,fulfillment_status,fulfillment_prev_status,status")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) throw new Error("order not found");
  if (order.fulfillment_status !== "on_hold") throw new Error("order is not on hold");
  const to = (order.fulfillment_prev_status ?? START) as FulfillmentStatus;
  assertFulfillmentTransition("on_hold", to);
  const patch: Record<string, unknown> = {
    fulfillment_status: to,
    fulfillment_prev_status: null,
    fulfillment_hold_reason: null,
    updated_at: new Date().toISOString(),
  };
  const mapped = fulfillmentToOrderStatus(to);
  if (mapped && mapped !== order.status) patch.status = mapped;
  await db.from("orders").update(patch).eq("id", order.id);
  await logEvent({ orderId: order.id, entityType: "fulfillment", entityId: order.id, event: "fulfillment.resumed", actorId: opts?.actorId, previousState: "on_hold", newState: to });
  return { ok: true, to };
}

export interface FulfillmentQueueRow {
  orderNumber: string;
  customerName: string;
  orderStatus: string;
  fulfillmentStatus: FulfillmentStatus;
  nextStates: FulfillmentStatus[];
  shipmentStatus: string | null;
  awb: string | null;
  courierName: string | null;
  holdReason: string | null;
  placedAt: string;
}

/** Orders awaiting/undergoing fulfillment (paid, not terminal), newest first. */
export async function getFulfillmentQueue(limit = 100): Promise<FulfillmentQueueRow[]> {
  const db = loose();
  const { data } = await db
    .from("orders")
    .select("id,order_number,status,fulfillment_status,fulfillment_hold_reason,ship_full_name,placed_at,shipments(status,awb,courier_name)")
    .eq("payment_status", "paid")
    .order("placed_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .filter((o: any) => !TERMINAL_ORDER.has(o.status))
    .map((o: any) => {
      const fs = (o.fulfillment_status ?? START) as FulfillmentStatus;
      const sh = Array.isArray(o.shipments) ? o.shipments[0] : o.shipments;
      return {
        orderNumber: o.order_number,
        customerName: o.ship_full_name ?? "",
        orderStatus: o.status,
        fulfillmentStatus: fs,
        nextStates: nextFulfillmentStates(fs),
        shipmentStatus: sh?.status ?? null,
        awb: sh?.awb ?? null,
        courierName: sh?.courier_name ?? null,
        holdReason: o.fulfillment_hold_reason ?? null,
        placedAt: o.placed_at,
      };
    });
}
