import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { cancelOrder, type CancellationType } from "@/services/cancellationService";

/**
 * POST /api/admin/orders/cancel — business cancellation (SLP principle 7).
 * Gated to manager+ (CS/Finance): warehouse editors CANNOT cancel or refund.
 * Body: { orderNumber, reason?, releaseInventory?, issueRefund?, refundAmount? }
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("manager");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — cancellation requires manager access." }, { status: 403 });

  let body: {
    orderNumber?: string;
    reason?: string;
    cancellationType?: CancellationType;
    releaseInventory?: boolean;
    issueRefund?: boolean;
    refundAmount?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

  const result = await cancelOrder({
    orderNumber: body.orderNumber,
    reason: body.reason,
    cancellationType: body.cancellationType,
    releaseInventory: body.releaseInventory,
    issueRefund: body.issueRefund,
    refundAmount: body.refundAmount,
    actorId: staff.userId ?? undefined,
  });

  if (!result.ok) {
    const map: Record<string, number> = { not_found: 404, not_cancellable: 409, cancel_failed: 422 };
    return NextResponse.json({ error: result.reason ?? "Could not cancel." }, { status: map[result.reason ?? ""] ?? 422 });
  }
  return NextResponse.json(result);
}
