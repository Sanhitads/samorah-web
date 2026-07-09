import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { getOrderByNumber } from "@/services/orderService";
import { issueRefund } from "@/services/refundService";

/**
 * POST /api/admin/orders/refund — a standalone refund (SLP principle 8), separate
 * from cancellation. Gated to manager+. Body: { orderNumber, amount?, reason? }.
 * Omitting `amount` refunds the full remaining balance. No customer email is sent
 * from here (that would need a dedicated refund template — a cancellation email
 * would misdescribe a refund on a live order); the refund event lands in the
 * audit stream via the service.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("order.refund");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the order.refund capability." }, { status: 403 });

  let body: { orderNumber?: string; amount?: number; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

  const order = await getOrderByNumber(body.orderNumber);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const o = order as unknown as {
    id: string;
    payment_status: string;
    total_amount: number;
    refund_amount: number | null;
    razorpay_payment_id: string | null;
  };

  if (o.payment_status === "pending" || o.payment_status === "failed") {
    return NextResponse.json({ error: "Order has no captured payment to refund." }, { status: 409 });
  }

  const remaining = Number(o.total_amount) - Number(o.refund_amount ?? 0);
  const amount = body.amount != null ? Math.min(body.amount, remaining) : remaining;
  if (amount <= 0) return NextResponse.json({ error: "Nothing left to refund." }, { status: 409 });

  const result = await issueRefund({
    orderId: o.id,
    amount,
    reason: body.reason,
    actorId: staff.userId ?? undefined,
    paymentId: o.razorpay_payment_id,
  });

  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Refund failed." }, { status: 422 });
  return NextResponse.json(result);
}
