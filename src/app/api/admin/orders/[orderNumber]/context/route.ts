import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getOrderByNumber } from "@/services/orderService";
import { getOrderRefunds } from "@/services/refundService";
import { getOrderTimeline } from "@/services/auditService";
import { RAZORPAY } from "@/config/commerce";

/**
 * GET /api/admin/orders/[orderNumber]/context — read-only per-order context for the Cancel and
 * Refund DIALOGS: the money breakdown, item count, prior refunds, and a short timeline. The list
 * page can't carry this (it queries only summary columns), and both dialogs need it — so it lives in
 * one endpoint reusing the existing readers rather than duplicating them.
 *
 * Gated to whoever can act on the order (order.cancel OR order.refund). Purely a read — it changes
 * nothing; the cancel/refund routes remain the only writers.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(staff.role, "order.cancel") && !hasCapability(staff.role, "order.refund")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderNumber } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = (await getOrderByNumber(orderNumber)) as any;
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const [refunds, timeline] = await Promise.all([
    getOrderRefunds(order.id),
    getOrderTimeline(order.id),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((order.order_items ?? []) as any[]).map((it) => ({
    name: it.product_name as string,
    variant: (it.variant_name ?? (it.vessel ? `${it.vessel} ${it.size}` : null)) as string | null,
    qty: Number(it.quantity),
  }));
  const units = items.reduce((s, it) => s + it.qty, 0);

  const total = Number(order.total_amount ?? 0);
  const refundAmount = Number(order.refund_amount ?? 0);
  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.discount_amount ?? 0);
  const shipping = Number(order.shipping_amount ?? 0);
  const tax = Number(order.cgst_amount ?? 0) + Number(order.sgst_amount ?? 0) + Number(order.igst_amount ?? 0);
  const hasPayment = Boolean(order.razorpay_payment_id);
  const paid = order.payment_status !== "pending" && order.payment_status !== "failed";

  return NextResponse.json({
    ok: true,
    order: {
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method ?? null,
      hasPayment,
      paid,
      gateway: Boolean(RAZORPAY.configured && hasPayment), // a refund would hit the gateway vs manual
      total,
      refundAmount,
      remaining: Math.max(0, total - refundAmount),
      subtotal,
      discount,
      products: Math.max(0, subtotal - discount), // goods portion for the refund breakdown
      shipping,
      tax,
      couponCode: order.coupon_code ?? null,
      loyaltyPoints: Number(order.loyalty_points_earned ?? 0),
      hasInvoice: Boolean(order.invoice_number),
      units,
      itemCount: items.length,
    },
    items,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refunds: (refunds as any[]).map((r) => ({
      amount: Number(r.amount), method: r.method, status: r.status,
      reason: r.reason ?? null, refundId: r.razorpay_refund_id ?? null, createdAt: r.created_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timeline: (timeline as any[]).slice(0, 8).map((e) => ({
      event: e.event, at: e.created_at, actorType: e.actor_type,
      notes: e.notes ?? null, prev: e.previous_state ?? null, next: e.new_state ?? null,
    })),
  });
}
