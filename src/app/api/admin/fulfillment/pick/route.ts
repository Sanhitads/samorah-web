import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { setItemPicked } from "@/services/fulfillmentService";

/**
 * POST /api/admin/fulfillment/pick { orderNumber, itemId, pickedQty } — record how many units of a
 * line are picked (clamped to the line quantity). Auto-advances picking→picked when the whole order
 * is picked. fulfillment.operate. Returns the recomputed progress + whether it advanced.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { orderNumber?: string; itemId?: string; pickedQty?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber || !body.itemId) return NextResponse.json({ error: "orderNumber and itemId are required." }, { status: 400 });

  const result = await setItemPicked(body.orderNumber, body.itemId, Number(body.pickedQty ?? 0), { actorId: staff.userId ?? undefined });
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Failed." }, { status: 422 });
  return NextResponse.json(result);
}
