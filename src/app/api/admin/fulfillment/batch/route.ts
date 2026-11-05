import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import type { Capability } from "@/lib/auth/capabilities";
import type { StaffActor } from "@/services/manufacturing/actor";
import { ForbiddenError } from "@/services/manufacturing/actor";
import {
  getOrderEntitlements, confirmPickBatch, confirmShipmentProvenance, recordPackingQc,
  orderShippedBatches, batchShippedOrders, orderPickConfirmations,
} from "@/services/manufacturing/fulfillmentProvenanceService";
import { getOrderByNumber } from "@/services/orderService";

/** Combined read for the BatchProvenancePanel: resolve an order number → entitlements + picks + shipped. */
async function panelData(orderNumber: string) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return { orderId: null, entitlements: null, picks: [], shipped: [] };
  const [entitlements, picks, shipped] = await Promise.all([
    getOrderEntitlements(order.id), orderPickConfirmations(order.id), orderShippedBatches(order.id),
  ]);
  return { orderId: order.id, orderNumber, entitlements, picks, shipped };
}

/**
 * POST /api/admin/fulfillment/batch — Phase 8 physical batch provenance actions.
 * Server-authoritative: each action declares the capability it needs; the actor identity comes from the
 * authenticated session (requireCapability), NEVER the request body. Business logic lives in the service /
 * SECURITY DEFINER RPCs. INERT for untracked commerce (confirm_pick requires a tracked variant).
 */
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (b: any, actor: StaffActor) => Promise<unknown>;
const ACTIONS: Record<string, { cap: Capability; run: Handler }> = {
  panel:               { cap: "manufacturing.operate", run: (b) => panelData(String(b.orderNumber)) },
  entitlements:        { cap: "manufacturing.operate", run: (b) => getOrderEntitlements(String(b.orderId)) },
  order_provenance:    { cap: "manufacturing.operate", run: (b) => orderShippedBatches(String(b.orderId)) },
  order_picks:         { cap: "manufacturing.operate", run: (b) => orderPickConfirmations(String(b.orderId)) },
  batch_provenance:    { cap: "manufacturing.operate", run: (b) => batchShippedOrders(String(b.batchId)) },
  confirm_pick:        { cap: "manufacturing.operate", run: (b, a) => confirmPickBatch(a, { orderItemId: String(b.orderItemId), batchId: String(b.batchId), qty: Number(b.qty), componentKey: b.componentKey, reason: b.reason }) },
  confirm_shipment:    { cap: "manufacturing.operate", run: (b, a) => confirmShipmentProvenance(a, String(b.shipmentId)) },
  packing_qc:          { cap: "manufacturing.qc",      run: (b, a) => recordPackingQc(a, String(b.orderId), b.checklist, { shipmentId: b.shipmentId, notes: b.notes }) },
};

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  const spec = ACTIONS[body?.action];
  if (!spec) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  const staff = await requireCapability(spec.cap);
  if (!staff.ok || !staff.userId) return NextResponse.json({ ok: false, error: `Forbidden — needs the ${spec.cap} capability.` }, { status: 403 });

  try {
    const result = await spec.run(body, { userId: staff.userId, role: staff.role ?? "" });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    const msg = e instanceof Error ? e.message : "Request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
