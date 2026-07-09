import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getOrderByNumber } from "@/services/orderService";
import { markShipmentDispatched } from "@/services/shipmentService";
import { tryAdvanceFulfillment } from "@/services/fulfillmentService";

/** POST /api/admin/fulfillment/dispatch { orderNumber } — staff-gated.
 *  Marks the shipment dispatched (order → shipped, queues the dispatch email). */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { orderNumber?: string };
  try {
    body = (await request.json()) as { orderNumber?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

  const order = await getOrderByNumber(body.orderNumber);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const result = await markShipmentDispatched(order.id, { actorId: staff.userId ?? undefined });
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not dispatch." }, { status: 422 });
  await tryAdvanceFulfillment(body.orderNumber, "picked_up", { actorId: staff.userId ?? undefined });
  return NextResponse.json({ dispatched: true, orderNumber: body.orderNumber });
}
