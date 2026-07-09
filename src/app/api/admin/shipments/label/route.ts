import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { regenerateLabel } from "@/services/shipmentService";

/** POST /api/admin/shipments/label { shipmentId } — (re)generate the label. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { shipmentId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.shipmentId) return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });

  const result = await regenerateLabel(body.shipmentId);
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not generate label." }, { status: 422 });
  return NextResponse.json(result);
}
