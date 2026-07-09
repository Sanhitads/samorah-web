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
import {
  effectivePriority,
  queueOf,
  nextActionLabel,
  EFFECTIVE_RANK,
  type EffectivePriority,
  type WorkQueue,
  type InventorySignal,
  type SlaTone,
} from "@/lib/fulfillment/derive";
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

export type BoardPriority = "normal" | "high" | "urgent" | "vip";
export const BOARD_PRIORITIES: BoardPriority[] = ["normal", "high", "urgent", "vip"];
/** Preset operational tags an operator can attach (Gift/COD are derived, not here). */
export const OPS_TAGS = ["Fragile", "Express", "Replacement", "Wholesale", "Complaint"] as const;
export type { InventorySignal, WorkQueue, EffectivePriority } from "@/lib/fulfillment/derive";

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
  // ── context (principles 11–17) ──
  priority: BoardPriority;            // manual override input
  effectivePriority: EffectivePriority; // computed (Critical/High/Normal) — board sorts on this
  slaTone: SlaTone;
  queue: WorkQueue;                   // derived functional queue (point 10)
  nextAction: string;                 // explicit next step (point 2)
  assignedTo: string | null;          // user id
  assigneeName: string | null;
  tags: string[];                     // derived (Gift/COD) + operational
  itemCount: number;
  paymentStatus: string;
  isCod: boolean;
  refundAmount: number;
  latestRefundStatus: string | null;  // ledger sub-state (point 4)
  note: string | null;                // gift note / occasion + warehouse note, combined for display
  inventory: InventorySignal;
}

/** SLA tone from order age — shared by reader (for priority) and UI. */
function slaToneOf(placedAt: string, now: number): SlaTone {
  const hrs = Math.max(0, (now - new Date(placedAt).getTime()) / 3.6e6);
  return hrs >= 48 ? "over" : hrs >= 24 ? "warn" : "ok";
}

/** Latest non-failed refund status per order (point 4) — one query for the whole page. */
async function latestRefundStatuses(db: any, orderIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!orderIds.length) return m;
  const { data } = await db
    .from("refunds")
    .select("order_id,status,created_at")
    .in("order_id", orderIds)
    .neq("status", "failed")
    .order("created_at", { ascending: false });
  for (const r of data ?? []) if (!m.has(r.order_id)) m.set(r.order_id, r.status); // first = newest
  return m;
}

/**
 * Orders awaiting/undergoing fulfillment (paid, not terminal), sorted by EFFECTIVE
 * priority then newest. Optional `queue` narrows to one functional queue (point 10).
 */
export async function getFulfillmentQueue(opts: { limit?: number; queue?: WorkQueue } = {}): Promise<FulfillmentQueueRow[]> {
  const limit = opts.limit ?? 100;
  const db = loose();
  const now = Date.now();
  const { data } = await db
    .from("orders")
    .select(
      "id,order_number,status,fulfillment_status,fulfillment_hold_reason,ship_full_name,placed_at," +
        "priority,assigned_to,ops_tags,ops_note,is_cod,payment_status,refund_amount,is_gift,gift_note,gift_occasion," +
        "shipments(status,awb,courier_name),order_items(quantity,variants(stock))",
    )
    .eq("payment_status", "paid")
    .order("placed_at", { ascending: false })
    .limit(limit);

  const live = (data ?? []).filter((o: any) => !TERMINAL_ORDER.has(o.status));

  // Resolve assignee names + latest refund states in one shot each (small tables).
  const staff = new Map<string, string>();
  const assigneeIds = [...new Set(live.map((o: any) => o.assigned_to).filter(Boolean))];
  if (assigneeIds.length) {
    const { data: users } = await db.from("users").select("id,full_name").in("id", assigneeIds);
    for (const u of users ?? []) staff.set(u.id, u.full_name ?? "");
  }
  const refundStatus = await latestRefundStatuses(db, live.map((o: any) => o.id));

  const rows: FulfillmentQueueRow[] = live.map((o: any) => {
    const fs = (o.fulfillment_status ?? START) as FulfillmentStatus;
    const sh = Array.isArray(o.shipments) ? o.shipments[0] : o.shipments;
    const items = Array.isArray(o.order_items) ? o.order_items : [];
    const itemCount = items.reduce((s: number, it: any) => s + (it.quantity ?? 0), 0);

    // Inventory (5/17): missing (oversold) → picking (in progress) → allocated (paid).
    let inventory: InventorySignal = items.length ? "allocated" : "unknown";
    for (const it of items) {
      const v = Array.isArray(it.variants) ? it.variants[0] : it.variants;
      if (v && typeof v.stock === "number" && v.stock < 0) inventory = "missing";
    }
    if (inventory === "allocated" && fs === "picking") inventory = "picking";

    // Tags (13): derived Gift/COD first, then operational tags.
    const tags: string[] = [];
    if (o.is_gift) tags.push("Gift");
    if (o.is_cod) tags.push("COD");
    for (const t of o.ops_tags ?? []) if (!tags.includes(t)) tags.push(t);

    const noteParts = [
      o.gift_note ? `Gift: ${o.gift_note}` : null,
      o.gift_occasion ? `Occasion: ${o.gift_occasion}` : null,
      o.ops_note || null,
    ].filter(Boolean);

    const manual = (o.priority ?? "normal") as BoardPriority;
    const slaTone = slaToneOf(o.placed_at, now);
    const eff = effectivePriority(manual, { slaTone, tags });

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
      priority: manual,
      effectivePriority: eff,
      slaTone,
      queue: queueOf(fs, inventory),
      nextAction: nextActionLabel(fs, sh?.status ?? null),
      assignedTo: o.assigned_to ?? null,
      assigneeName: o.assigned_to ? staff.get(o.assigned_to) ?? null : null,
      tags,
      itemCount,
      paymentStatus: o.payment_status,
      isCod: o.is_cod,
      refundAmount: Number(o.refund_amount ?? 0),
      latestRefundStatus: refundStatus.get(o.id) ?? null,
      note: noteParts.length ? noteParts.join(" · ") : null,
      inventory,
    };
  });

  const filtered = opts.queue ? rows.filter((r) => r.queue === opts.queue) : rows;
  return filtered.sort((a, b) => {
    const pr = EFFECTIVE_RANK[a.effectivePriority] - EFFECTIVE_RANK[b.effectivePriority];
    if (pr !== 0) return pr;
    return b.placedAt.localeCompare(a.placedAt);
  });
}

/** Counts per work queue (for the board's queue tabs) — one pass over the full set. */
export async function getQueueCounts(): Promise<Record<WorkQueue, number>> {
  const all = await getFulfillmentQueue({ limit: 500 });
  const counts: Record<WorkQueue, number> = { pick: 0, pack: 0, ship: 0, exceptions: 0, hold: 0 };
  for (const r of all) counts[r.queue]++;
  return counts;
}

// ── Board context mutators (principles 11–13, 15) ────────────────────────────
async function orderIdByNumber(db: any, orderNumber: string): Promise<string | null> {
  const { data } = await db.from("orders").select("id").eq("order_number", orderNumber).maybeSingle();
  return data?.id ?? null;
}

export async function setPriority(orderNumber: string, priority: BoardPriority, opts?: { actorId?: string }): Promise<{ ok: boolean }> {
  if (!BOARD_PRIORITIES.includes(priority)) throw new Error("invalid priority");
  const db = loose();
  const id = await orderIdByNumber(db, orderNumber);
  if (!id) throw new Error("order not found");
  await db.from("orders").update({ priority, updated_at: new Date().toISOString() }).eq("id", id);
  await logEvent({ orderId: id, entityType: "fulfillment", entityId: id, event: "fulfillment.priority_set", actorId: opts?.actorId, newState: priority });
  return { ok: true };
}

export async function assignOrder(orderNumber: string, assignTo: string | null, opts?: { actorId?: string }): Promise<{ ok: boolean }> {
  const db = loose();
  const id = await orderIdByNumber(db, orderNumber);
  if (!id) throw new Error("order not found");
  await db.from("orders").update({ assigned_to: assignTo, updated_at: new Date().toISOString() }).eq("id", id);
  await logEvent({ orderId: id, entityType: "fulfillment", entityId: id, event: assignTo ? "fulfillment.assigned" : "fulfillment.unassigned", actorId: opts?.actorId, notes: assignTo ?? undefined });
  return { ok: true };
}

export async function setOpsTags(orderNumber: string, tags: string[], opts?: { actorId?: string }): Promise<{ ok: boolean }> {
  const clean = [...new Set(tags.filter((t) => (OPS_TAGS as readonly string[]).includes(t)))];
  const db = loose();
  const id = await orderIdByNumber(db, orderNumber);
  if (!id) throw new Error("order not found");
  await db.from("orders").update({ ops_tags: clean, updated_at: new Date().toISOString() }).eq("id", id);
  await logEvent({ orderId: id, entityType: "fulfillment", entityId: id, event: "fulfillment.tagged", actorId: opts?.actorId, notes: clean.join(", ") || "(cleared)" });
  return { ok: true };
}
