import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { receiveRtoGoods, type RtoReceiveLine } from "@/services/rtoReceivingService";

/**
 * POST /api/admin/shipments/receive { shipmentId, note?, lines: [{ variantId, received, restockable, damaged }] }
 * Records + commits ONE physical RTO receipt for a shipment in status 'rto'. Physical receiving is an
 * operational fulfillment action → fulfillment.operate (never inventory.adjust). Collects physical facts
 * only; DB CHECKs + commit_receipt remain authoritative. Never accepts raw stock deltas; never touches money.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { shipmentId?: string; note?: string; lines?: RtoReceiveLine[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { shipmentId, note, lines } = body;
  if (!shipmentId || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "shipmentId and at least one receipt line are required." }, { status: 400 });
  }

  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the fulfillment.operate capability." }, { status: 403 });

  try {
    const result = await receiveRtoGoods(shipmentId, lines, { note, actorId: staff.userId ?? undefined });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not record receipt." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
