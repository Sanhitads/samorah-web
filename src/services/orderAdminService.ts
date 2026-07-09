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
