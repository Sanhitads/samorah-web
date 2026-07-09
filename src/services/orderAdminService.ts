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

/** Recent orders, newest first, for the management list. */
export async function getOrdersOverview(limit = 100): Promise<OrderOverviewRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id,order_number,email,ship_full_name,status,payment_status,is_cod,total_amount,refund_amount,razorpay_payment_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((o) => {
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
      hasPayment: Boolean(r.razorpay_payment_id),
      placedAt: r.created_at,
    };
  });
}
