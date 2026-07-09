/**
 * Read models for the Order Management admin (SLP principle 21's Orders module).
 * Distinct from the Fulfillment Board reader: this is the commercial view of an
 * order — money, payment state, refunds — not the warehouse workflow.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface OrderOverviewRow {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  status: string; // order_status
  paymentStatus: string; // payment_status
  isCod: boolean;
  total: number;
  refundAmount: number;
  latestRefundStatus: string | null; // ledger sub-state (review point 4)
  hasPayment: boolean; // a captured Razorpay payment exists (gateway refund possible)
  placedAt: string;
}

export interface DashboardStats {
  awaitingFulfillment: number; // paid, not terminal, not yet shipped
  onHold: number;
  readyForDispatch: number;
  shippedActive: number; // shipped but not delivered
  refundsPending: number; // refunds not yet processed/failed
  totalOrders: number;
}

/** Headline counts for the admin Dashboard (principle 21's landing module). Uses
 *  PostgREST head+exact counts, so no rows travel — just the numbers. */
export async function getDashboardStats(): Promise<DashboardStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const active = ["confirmed", "processing", "packed"]; // paid but pre-ship, non-terminal
  const head = (q: unknown) => (q as { count: number | null }).count ?? 0;

  const [awaiting, onHold, ready, shippedActive, total, refundsPending] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid").in("status", active),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "on_hold"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "ready_for_dispatch"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "shipped"),
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("refunds").select("id", { count: "exact", head: true }).in("status", ["initiated", "processing"]),
  ]);

  return {
    awaitingFulfillment: head(awaiting),
    onHold: head(onHold),
    readyForDispatch: head(ready),
    shippedActive: head(shippedActive),
    totalOrders: head(total),
    refundsPending: head(refundsPending),
  };
}

export interface OperationalMetrics {
  avgPickMinutes: number | null;
  avgPackMinutes: number | null;
  oldestWaitingHours: number | null;
  ordersWaiting: number;
  ordersOnHold: number;
  refundQueue: number;
}

/** Mean minutes between a start event and its matching end event, per order. */
function meanDuration(events: { order_id: string; event: string; created_at: string }[], startEv: string, endEv: string): number | null {
  const starts = new Map<string, number>();
  const durations: number[] = [];
  // events arrive newest-first; walk oldest-first so start precedes end.
  for (const e of [...events].reverse()) {
    if (e.event === startEv) starts.set(e.order_id, new Date(e.created_at).getTime());
    else if (e.event === endEv && starts.has(e.order_id)) {
      durations.push((new Date(e.created_at).getTime() - (starts.get(e.order_id) as number)) / 60000);
      starts.delete(e.order_id);
    }
  }
  if (!durations.length) return null;
  return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
}

/** Warehouse timing + queue depth for the Dashboard (review point 12). */
export async function getOperationalMetrics(): Promise<OperationalMetrics> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const active = ["confirmed", "processing", "packed"];

  const { data: events } = await db
    .from("audit_events")
    .select("order_id,event,created_at")
    .in("event", ["fulfillment.picking", "fulfillment.picked", "fulfillment.packing", "fulfillment.packed"])
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: oldest } = await db
    .from("orders")
    .select("placed_at")
    .eq("payment_status", "paid")
    .in("status", active)
    .order("placed_at", { ascending: true })
    .limit(1);

  const [waiting, onHold, refundQueue] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid").in("status", active),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "on_hold"),
    db.from("refunds").select("id", { count: "exact", head: true }).in("status", ["initiated", "processing"]),
  ]);

  const ev = (events ?? []) as { order_id: string; event: string; created_at: string }[];
  const oldestAt = (oldest ?? [])[0]?.placed_at as string | undefined;

  return {
    avgPickMinutes: meanDuration(ev, "fulfillment.picking", "fulfillment.picked"),
    avgPackMinutes: meanDuration(ev, "fulfillment.packing", "fulfillment.packed"),
    oldestWaitingHours: oldestAt ? Math.round(((Date.now() - new Date(oldestAt).getTime()) / 3.6e6) * 10) / 10 : null,
    ordersWaiting: (waiting as { count: number | null }).count ?? 0,
    ordersOnHold: (onHold as { count: number | null }).count ?? 0,
    refundQueue: (refundQueue as { count: number | null }).count ?? 0,
  };
}

/** Recent orders, newest first, for the management list. */
export async function getOrdersOverview(limit = 100): Promise<OrderOverviewRow[]> {
  // Loose: refund_amount / refunds aren't in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = createAdminClient() as any;
  const { data, error } = await loose
    .from("orders")
    .select(
      "id,order_number,email,ship_full_name,status,payment_status,is_cod,total_amount,refund_amount,razorpay_payment_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const orders = (data ?? []) as { id: string }[];

  // Latest non-failed refund status per order, in one query (point 4).
  const ids = orders.map((o) => o.id);
  const refundStatus = new Map<string, string>();
  if (ids.length) {
    const { data: refunds } = await loose
      .from("refunds")
      .select("order_id,status,created_at")
      .in("order_id", ids)
      .neq("status", "failed")
      .order("created_at", { ascending: false });
    for (const r of refunds ?? []) if (!refundStatus.has(r.order_id)) refundStatus.set(r.order_id, r.status);
  }

  return orders.map((o) => {
    const r = o as unknown as {
      id: string;
      order_number: string;
      email: string;
      ship_full_name: string | null;
      status: string;
      payment_status: string;
      is_cod: boolean;
      total_amount: number;
      refund_amount: number | null;
      razorpay_payment_id: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.ship_full_name ?? r.email,
      email: r.email,
      status: r.status,
      paymentStatus: r.payment_status,
      isCod: r.is_cod,
      total: Number(r.total_amount),
      refundAmount: Number(r.refund_amount ?? 0),
      latestRefundStatus: refundStatus.get(r.id) ?? null,
      hasPayment: Boolean(r.razorpay_payment_id),
      placedAt: r.created_at,
    };
  });
}
