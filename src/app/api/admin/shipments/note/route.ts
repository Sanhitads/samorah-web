import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { addShipmentNote } from "@/services/shipmentService";

/**
 * POST /api/admin/shipments/note { shipmentId, note } — append a staff-only internal note to a
 * shipment (review priority 2.10: "customer unavailable", "delay due to rain", …). Recorded on the
 * audit stream — no new table, reuses the same infrastructure as orders/returns. fulfillment.operate.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { shipmentId?: string; note?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.shipmentId || !body.note?.trim()) return NextResponse.json({ error: "shipmentId and note are required." }, { status: 400 });

  const r = await addShipmentNote(body.shipmentId, body.note, staff.userId ?? undefined);
  if (!r.ok) return NextResponse.json({ error: r.reason ?? "Failed." }, { status: 422 });
  return NextResponse.json(r);
}
