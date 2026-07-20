/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Returns service (review point 9) — the integrative module. A return moves through
 * its own state machine and, at the right transitions, reaches into the other
 * modules: it RESTOCKS inventory and issues a REFUND when it settles, writes to the
 * immutable AUDIT stream throughout, and (later) notifies the customer + schedules a
 * reverse SHIPMENT. Forward and reverse logistics stay separate state machines.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc } from "@/lib/supabase/rpc";
import { getOrderByNumber } from "@/services/orderService";
import { issueRefund } from "@/services/refundService";
import { logEvent } from "@/services/auditService";
import { assertReturnTransition, isTerminalReturn, nextReturnStates, type ReturnStatus, type ReturnReason } from "@/lib/returns/state";
import type { NotificationEvent } from "@/lib/notifications/types";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/**
 * Fire a return notification through the engine. Lazy import breaks the module
 * cycle (returnService → engine → email channel → returnService) and keeps
 * notification failures from ever breaking the return transition.
 */
async function emitReturnEvent(event: NotificationEvent, orderId: string, returnId: string): Promise<void> {
  try {
    const { notify } = await import("@/lib/notifications/engine");
    await notify(event, { orderId, returnId });
  } catch (e) {
    console.error("return notify failed", e);
  }
}

// Reasons where the item should NOT go back to sellable stock by default.
const NON_RESTOCK_REASONS = new Set<ReturnReason>(["damaged", "defective"]);

export interface CreateReturnItem {
  orderItemId?: string;
  variantId?: string | null;
  sku?: string | null;
  productName?: string | null;
  quantity: number;
  lineAmount: number;
  restock?: boolean;
}

export interface CreateReturnInput {
  orderNumber: string;
  reason: ReturnReason;
  returnType?: "refund" | "replacement" | "exchange";
  items?: CreateReturnItem[]; // omit = full return of every line
  notes?: string;
  actorId?: string;
}

/** Open a return (RMA). Defaults to a full return when no items are specified. */
export async function createReturn(input: CreateReturnInput): Promise<{ ok: boolean; returnId?: string; rma?: string; reason?: string }> {
  const order = await getOrderByNumber(input.orderNumber);
  if (!order) return { ok: false, reason: "order_not_found" };
  const o = order as unknown as { id: string; order_number: string; order_items?: any[] };

  const defaultRestock = !NON_RESTOCK_REASONS.has(input.reason);
  const items: CreateReturnItem[] =
    input.items && input.items.length
      ? input.items
      : (o.order_items ?? []).map((li: any) => ({
          orderItemId: li.id,
          variantId: li.variant_id,
          sku: li.sku,
          productName: li.product_name,
          quantity: li.quantity,
          lineAmount: Number(li.line_total ?? 0),
          restock: defaultRestock,
        }));
  if (!items.length) return { ok: false, reason: "no_items" };

  const refundAmount = items.reduce((s, it) => s + Number(it.lineAmount ?? 0), 0);
  const db = loose();

  // RMA: one per return; suffix when an order has multiple.
  const { data: prior } = await db.from("returns").select("id").eq("order_id", o.id);
  const n = (prior ?? []).length;
  const rma = n === 0 ? `RMA-${o.order_number}` : `RMA-${o.order_number}-${n + 1}`;

  const { data: created, error } = await db
    .from("returns")
    .insert({
      order_id: o.id,
      order_number: o.order_number,
      rma_number: rma,
      status: "requested",
      reason: input.reason,
      return_type: input.returnType ?? "refund",
      refund_amount: refundAmount,
      notes: input.notes ?? null,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, reason: error?.message ?? "insert_failed" };
  const returnId = created.id as string;

  await db.from("return_items").insert(
    items.map((it) => ({
      return_id: returnId,
      order_item_id: it.orderItemId ?? null,
      variant_id: it.variantId ?? null,
      sku: it.sku ?? null,
      product_name: it.productName ?? null,
      quantity: it.quantity,
      line_amount: Number(it.lineAmount ?? 0),
      restock: it.restock ?? defaultRestock,
    })),
  );
  await db.from("return_events").insert({ return_id: returnId, status: "requested", description: input.reason });

  await logEvent({
    orderId: o.id,
    entityType: "return",
    entityId: returnId,
    event: "return.requested",
    actorType: input.actorId ? "staff" : "system",
    actorId: input.actorId,
    newState: "requested",
    notes: `${rma} · ${input.reason}`,
    metadata: { rma, returnType: input.returnType ?? "refund", refundAmount, items: items.length },
  });

  await emitReturnEvent("return.requested", o.id, returnId);
  return { ok: true, returnId, rma };
}

/**
 * Advance a return through its state machine. On entry to `refund` it settles the
 * money side (issue refund for the RMA amount) and the inventory side (restock the
 * flagged lines) — exactly once, guarded by the existing refund_id.
 */
export async function advanceReturn(
  returnId: string,
  to: ReturnStatus,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; from?: ReturnStatus; to?: ReturnStatus; reason?: string }> {
  const db = loose();
  const { data: ret } = await db
    .from("returns")
    .select("id,order_id,status,reason,return_type,refund_amount,refund_id,rma_number")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };

  const from = ret.status as ReturnStatus;
  assertReturnTransition(from, to);

  let refundId: string | null = ret.refund_id ?? null;
  let restocked = 0;

  if (to === "refund_processing") {
    // Restock the sellable lines (inventory tie), once.
    restocked = await callRpc<number>("restock_return_items", { p_return_id: returnId });

    // Issue the refund (payments tie) for refund/exchange types, once.
    if (!refundId && ret.return_type !== "replacement" && Number(ret.refund_amount ?? 0) > 0) {
      const { data: order } = await db.from("orders").select("razorpay_payment_id").eq("id", ret.order_id).maybeSingle();
      const r = await issueRefund({
        orderId: ret.order_id,
        amount: Number(ret.refund_amount),
        reason: `Return ${ret.rma_number}`,
        actorId: opts?.actorId,
        paymentId: order?.razorpay_payment_id ?? null,
      });
      if (r.ok) refundId = r.refundId ?? null;
    }
  }

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (refundId && !ret.refund_id) patch.refund_id = refundId;
  if (isTerminalReturn(to)) patch.closed_at = new Date().toISOString();
  await db.from("returns").update(patch).eq("id", returnId);
  await db.from("return_events").insert({ return_id: returnId, status: to });

  await logEvent({
    orderId: ret.order_id,
    entityType: "return",
    entityId: returnId,
    event: `return.${to}`,
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    previousState: from,
    newState: to,
    notes: ret.rma_number,
    metadata: to === "refund_processing" ? { restocked, refundId } : undefined,
  });

  // Notify the customer on the meaningful transitions (fan-out via the engine).
  const NOTIFY: Partial<Record<ReturnStatus, NotificationEvent>> = {
    approved: "return.approved",
    rejected: "return.rejected",
    refunded: "return.refunded",
  };
  const ev = NOTIFY[to];
  if (ev) await emitReturnEvent(ev, ret.order_id, returnId);

  return { ok: true, from, to };
}

export interface ReturnRow {
  id: string;
  rma: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string | null;
  returnType: string;
  refundAmount: number;
  itemCount: number;
  nextStates: ReturnStatus[];
  createdAt: string;
}

export interface ReturnEmailContext {
  order_number: string;
  rma: string;
  ship_full_name: string | null;
  email: string;
  reason: string | null;
  return_type: string | null;
  refund_amount: number | null;
}

/** Assemble the email context for a return (joins the order for name + email). */
export async function getReturnInfo(returnId: string): Promise<ReturnEmailContext | null> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("rma_number,order_number,reason,return_type,refund_amount,orders(email,ship_full_name)")
    .eq("id", returnId)
    .maybeSingle();
  if (!data) return null;
  const o = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  return {
    order_number: data.order_number,
    rma: data.rma_number,
    ship_full_name: o?.ship_full_name ?? null,
    email: o?.email ?? "",
    reason: data.reason ?? null,
    return_type: data.return_type ?? null,
    refund_amount: data.refund_amount != null ? Number(data.refund_amount) : null,
  };
}

/** Open + recent returns for the admin module. */
export async function getReturnsQueue(limit = 100): Promise<ReturnRow[]> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("id,rma_number,order_number,status,reason,return_type,refund_amount,created_at,return_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    rma: r.rma_number,
    orderNumber: r.order_number,
    status: r.status as ReturnStatus,
    reason: r.reason,
    returnType: r.return_type,
    refundAmount: Number(r.refund_amount ?? 0),
    itemCount: (r.return_items ?? []).reduce((s: number, it: any) => s + (it.quantity ?? 0), 0),
    nextStates: nextReturnStates(r.status as ReturnStatus),
    createdAt: r.created_at,
  }));
}

/** Returns for ONE order (Order Detail returns section). Additive reader over the existing table;
 *  one indexed query by order_id, no new logic. */
export async function getReturnsForOrder(orderId: string): Promise<Array<{ id: string; rma: string | null; status: string; reason: string | null; refundAmount: number; createdAt: string }>> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("id,rma_number,status,reason,refund_amount,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    rma: r.rma_number ?? null,
    status: r.status as string,
    reason: r.reason ?? null,
    refundAmount: Number(r.refund_amount ?? 0),
    createdAt: r.created_at,
  }));
}

export interface ReturnUpdate {
  resolution?: string;
  refundMethod?: string;
  inspectionResult?: string;
  inspectionNote?: string;
  warehouseDecision?: string;
  damage?: string;
  internalNote?: string; // → returns.notes
  customerMessage?: string; // → returns.customer_message
}

/**
 * Set the Resolution-Center fields on a return (any subset). Resolution / inspection / warehouse
 * decision each stamp operator + timestamp; every change writes ONE audit event. Reuses the same
 * logEvent + returns table — no parallel record. Capability is enforced at the route.
 */
export async function updateReturnRecord(returnId: string, u: ReturnUpdate, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("id,order_id,rma_number").eq("id", returnId).maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  const changes: string[] = [];

  if (u.resolution !== undefined) { patch.resolution = u.resolution || null; patch.resolution_by = actorId ?? null; patch.resolved_at = now; changes.push(`resolution=${u.resolution || "cleared"}`); }
  if (u.refundMethod !== undefined) { patch.refund_method = u.refundMethod || null; changes.push(`refund_method=${u.refundMethod || "cleared"}`); }
  if (u.inspectionResult !== undefined) { patch.inspection_result = u.inspectionResult || null; patch.inspection_by = actorId ?? null; patch.inspected_at = now; changes.push(`inspection=${u.inspectionResult || "cleared"}`); }
  if (u.inspectionNote !== undefined) patch.inspection_note = u.inspectionNote || null;
  if (u.warehouseDecision !== undefined) { patch.warehouse_decision = u.warehouseDecision || null; patch.warehouse_decision_by = actorId ?? null; patch.warehouse_decided_at = now; changes.push(`warehouse=${u.warehouseDecision || "cleared"}`); }
  if (u.damage !== undefined) { patch.damage_classification = u.damage || null; changes.push(`damage=${u.damage || "cleared"}`); }
  if (u.internalNote !== undefined) { patch.notes = u.internalNote || null; changes.push("internal note"); }
  if (u.customerMessage !== undefined) { patch.customer_message = u.customerMessage || null; changes.push("customer message"); }

  if (changes.length === 0) return { ok: true };
  const { error } = await db.from("returns").update(patch).eq("id", returnId);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ orderId: ret.order_id, entityType: "return", entityId: returnId, event: "return.updated", actorType: actorId ? "staff" : "system", actorId, notes: `${ret.rma_number}: ${changes.join(", ")}`, metadata: { ...u } });
  return { ok: true };
}

/** Full return record for the Resolution Center detail page: the row (all resolution/inspection/
 *  warehouse/notes fields), its line items, and its evidence attachments. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReturnDetail(returnId: string): Promise<{ ret: any; items: any[]; attachments: any[] } | null> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("*").eq("id", returnId).maybeSingle();
  if (!ret) return null;
  const [{ data: items }, { data: attachments }] = await Promise.all([
    db.from("return_items").select("*").eq("return_id", returnId).order("created_at"),
    db.from("return_attachments").select("*").eq("return_id", returnId).order("created_at"),
  ]);
  // Resolve actor names for resolution / inspection / warehouse decision (one query).
  const ids = [...new Set([ret.resolution_by, ret.inspection_by, ret.warehouse_decision_by, ret.created_by].filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await db.from("users").select("id,full_name").in("id", ids);
    for (const u of users ?? []) names.set(u.id, u.full_name ?? "");
  }
  ret.resolution_by_name = ret.resolution_by ? names.get(ret.resolution_by) ?? null : null;
  ret.inspection_by_name = ret.inspection_by ? names.get(ret.inspection_by) ?? null : null;
  ret.warehouse_decision_by_name = ret.warehouse_decision_by ? names.get(ret.warehouse_decision_by) ?? null : null;
  return { ret, items: items ?? [], attachments: attachments ?? [] };
}
