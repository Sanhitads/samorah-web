import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { cancelShipment } from "@/services/shipmentService";

/** POST /api/admin/shipments/cancel { shipmentId, reason? } — fulfillment.operate. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { shipmentId?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.shipmentId) return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });

  try {
    const result = await cancelShipment(body.shipmentId, { actorId: staff.userId ?? undefined, reason: body.reason });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not cancel." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
