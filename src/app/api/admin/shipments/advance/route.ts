import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { advanceShipment } from "@/services/shipmentService";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/lib/shipment/state";

/**
 * POST /api/admin/shipments/advance { shipmentId, to, recipient?, reason?,
 * description?, location? } — manual courier update. Operational → fulfillment.operate.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { shipmentId?: string; to?: string; recipient?: string; reason?: string; description?: string; location?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { shipmentId, to } = body;
  if (!shipmentId || !to || !(SHIPMENT_STATUSES as readonly string[]).includes(to)) {
    return NextResponse.json({ error: "shipmentId and a valid `to` status are required." }, { status: 400 });
  }

  try {
    const result = await advanceShipment(shipmentId, to as ShipmentStatus, {
      actorId: staff.userId ?? undefined,
      recipient: body.recipient,
      reason: body.reason,
      description: body.description,
      location: body.location,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not advance." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
