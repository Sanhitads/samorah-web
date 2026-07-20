import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { setPackingItem } from "@/services/fulfillmentService";

/**
 * POST /api/admin/fulfillment/packing { orderNumber, itemKey, done } — check/uncheck one packing
 * collateral item. fulfillment.operate. Returns whether the checklist is now complete (which is what
 * unlocks "Mark Packed"). The advance→packed transition also re-enforces this server-side.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { orderNumber?: string; itemKey?: string; done?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber || !body.itemKey) return NextResponse.json({ error: "orderNumber and itemKey are required." }, { status: 400 });

  const result = await setPackingItem(body.orderNumber, body.itemKey, Boolean(body.done), { actorId: staff.userId ?? undefined });
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Failed." }, { status: 422 });
  return NextResponse.json(result);
}
