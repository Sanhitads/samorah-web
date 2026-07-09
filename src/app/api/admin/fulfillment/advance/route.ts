import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { advanceFulfillment } from "@/services/fulfillmentService";
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "@/lib/fulfillment/state";

/** POST /api/admin/fulfillment/advance { orderNumber, to } — staff-gated. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { orderNumber?: string; to?: string };
  try {
    body = (await request.json()) as { orderNumber?: string; to?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { orderNumber, to } = body;
  if (!orderNumber || !to || !(FULFILLMENT_STATUSES as readonly string[]).includes(to)) {
    return NextResponse.json({ error: "orderNumber and a valid `to` status are required." }, { status: 400 });
  }
  try {
    const result = await advanceFulfillment(orderNumber, to as FulfillmentStatus, { actorId: staff.userId ?? undefined });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
