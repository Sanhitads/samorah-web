import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { getOrderByNumber } from "@/services/orderService";
import { createShipmentForOrder } from "@/services/shipmentService";
import { tryAdvanceFulfillment } from "@/services/fulfillmentService";

/** POST /api/admin/fulfillment/create-shipment { orderNumber } — staff-gated.
 *  Creates the shipment via the active provider, then advances fulfillment. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
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

  const result = await createShipmentForOrder(order.id, { actorId: staff.userId ?? undefined });
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not create shipment." }, { status: 422 });
  await tryAdvanceFulfillment(body.orderNumber, "courier_assigned", { actorId: staff.userId ?? undefined });
  return NextResponse.json({ ...result });
}
