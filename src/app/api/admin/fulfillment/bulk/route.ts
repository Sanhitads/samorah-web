import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { getOrderByNumber } from "@/services/orderService";
import { createShipmentForOrder, markShipmentDispatched } from "@/services/shipmentService";
import { tryAdvanceFulfillment } from "@/services/fulfillmentService";

/**
 * POST /api/admin/fulfillment/bulk { action, orderNumbers[] } — batch operations
 * over the fulfillment board (the "select many → create shipments / dispatch"
 * productivity win). Each item runs the same idempotent single-item service, so
 * partial failures are isolated and reported. fulfillment.operate.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { action?: string; orderNumbers?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const nums = (body.orderNumbers ?? []).slice(0, 200);
  if (!nums.length) return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  const actorId = staff.userId ?? undefined;

  let done = 0;
  const failed: { orderNumber: string; reason: string }[] = [];

  for (const orderNumber of nums) {
    try {
      if (body.action === "createShipment") {
        const order = await getOrderByNumber(orderNumber);
        if (!order) { failed.push({ orderNumber, reason: "not found" }); continue; }
        const r = await createShipmentForOrder((order as { id: string }).id, { actorId });
        if (r.ok) { await tryAdvanceFulfillment(orderNumber, "courier_assigned", { actorId }); done++; }
        else failed.push({ orderNumber, reason: r.reason ?? "failed" });
      } else if (body.action === "dispatch") {
        const order = await getOrderByNumber(orderNumber);
        if (!order) { failed.push({ orderNumber, reason: "not found" }); continue; }
        const r = await markShipmentDispatched((order as { id: string }).id, { actorId });
        if (r.ok) { await tryAdvanceFulfillment(orderNumber, "picked_up", { actorId }); done++; }
        else failed.push({ orderNumber, reason: r.reason ?? "failed" });
      } else {
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
      }
    } catch (e) {
      failed.push({ orderNumber, reason: e instanceof Error ? e.message : "error" });
    }
  }

  return NextResponse.json({ ok: true, done, failed });
}
