import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { bulkAdvanceShipments, bulkAssignShipmentCourier } from "@/services/shipmentService";
import type { ShipmentStatus } from "@/lib/shipment/state";

/**
 * POST /api/admin/shipments/bulk { action, shipmentIds[], courier? } — safe batch operations over
 * the shipments board. Each item runs the same guarded single-item service, so partial failures are
 * isolated and reported. fulfillment.operate.
 *
 * Deliberately NOT batchable: RTO and Exception. Both need a per-parcel reason and are high-impact,
 * so they stay individual (review priority 1.4) — this route rejects them.
 */
export const runtime = "nodejs";

const STATUS_ACTIONS: Record<string, ShipmentStatus> = {
  markInTransit: "in_transit",
  markOutForDelivery: "out_for_delivery",
  markDelivered: "delivered",
};

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { action?: string; shipmentIds?: string[]; courier?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const ids = (body.shipmentIds ?? []).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: "No shipments selected." }, { status: 400 });
  const actorId = staff.userId ?? undefined;

  // Guardrail: RTO / exception are per-parcel decisions, never bulk.
  if (body.action === "rto" || body.action === "exception") {
    return NextResponse.json({ error: "RTO and Exception must be reported individually, with a reason." }, { status: 400 });
  }

  if (body.action === "assignCourier") {
    if (!body.courier?.trim()) return NextResponse.json({ error: "Courier is required." }, { status: 400 });
    const r = await bulkAssignShipmentCourier(ids, body.courier.trim(), actorId);
    return NextResponse.json({ ok: true, ...r });
  }

  const to = body.action ? STATUS_ACTIONS[body.action] : undefined;
  if (!to) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const r = await bulkAdvanceShipments(ids, to, actorId);
  return NextResponse.json({ ok: true, ...r });
}
