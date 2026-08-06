import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { closeRtoReceiving } from "@/services/rtoReceivingService";

/**
 * POST /api/admin/shipments/receiving/close { shipmentId } — the authoritative RTO receiving-closure
 * boundary. Operational fulfillment action → fulfillment.operate. The DB (close_rto_receiving) enforces
 * the real invariants: status='rto', zero open drafts, idempotent second close, and the shipment-row lock
 * that serialises against concurrent RTO receipt commits.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { shipmentId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { shipmentId } = body;
  if (!shipmentId) return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });

  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the fulfillment.operate capability." }, { status: 403 });

  try {
    const result = await closeRtoReceiving(shipmentId, { actorId: staff.userId ?? undefined });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not close receiving." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
