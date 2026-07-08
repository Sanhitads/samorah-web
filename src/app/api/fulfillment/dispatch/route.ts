import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { getOrderByNumber } from "@/services/orderService";
import { markShipmentDispatched } from "@/services/shipmentService";

/**
 * POST /api/fulfillment/dispatch — mark an order's shipment dispatched (picked up),
 * advance the order → shipped, and queue the ORDER_DISPATCHED email. A manual/admin
 * action today (guarded by CRON_SECRET until the admin dashboard + auth land); a
 * provider webhook will drive this automatically once a courier adapter is live.
 * Body: { orderNumber: string }.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: { orderNumber?: string };
  try {
    body = (await request.json()) as { orderNumber?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) {
    return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });
  }
  const order = await getOrderByNumber(body.orderNumber);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  const result = await markShipmentDispatched(order.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "Could not dispatch." }, { status: 422 });
  }
  return NextResponse.json({ dispatched: true, orderNumber: body.orderNumber });
}
