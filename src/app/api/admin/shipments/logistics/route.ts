import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateShipmentLogistics } from "@/services/shipmentService";

/**
 * POST /api/admin/shipments/logistics { shipmentId, changes: {field: value}, reason } — a controlled,
 * reason-required edit of a shipment's operational logistics values (weights / dimensions / manual
 * costs). Product-derived weights + GST + total logistics cost are recomputed server-side, never
 * accepted from the client. Every field change is audited (old → new + reason). fulfillment.operate.
 */
export const runtime = "nodejs";

const FRIENDLY: Record<string, string> = {
  reason_required: "A reason is required before saving.",
  shipment_not_found: "Shipment not found.",
  chargeable_manual_only: "Chargeable weight is read-only for courier-integrated shipments.",
};

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — fulfillment.operate required." }, { status: 403 });

  let body: { shipmentId?: string; changes?: Record<string, number>; reason?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.shipmentId || !body.changes || !Object.keys(body.changes).length) return NextResponse.json({ error: "shipmentId and changes are required." }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const result = await updateShipmentLogistics(body.shipmentId, body.changes, body.reason, staff.userId ?? undefined);
  if (!result.ok) {
    const msg = (result.reason && FRIENDLY[result.reason]) || `Could not save — ${result.reason ?? "error"}.`;
    return NextResponse.json({ error: msg }, { status: result.reason === "shipment_not_found" ? 404 : 422 });
  }
  return NextResponse.json(result);
}
