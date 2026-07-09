import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { createReturn } from "@/services/returnService";
import type { ReturnReason } from "@/lib/returns/state";

/**
 * POST /api/admin/returns/create — open a return (RMA). Operational action →
 * returns.operate. Body: { orderNumber, reason, returnType?, notes? } (full return).
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("returns.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the returns.operate capability." }, { status: 403 });

  let body: { orderNumber?: string; reason?: ReturnReason; returnType?: "refund" | "replacement" | "exchange"; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber || !body.reason) return NextResponse.json({ error: "orderNumber and reason are required." }, { status: 400 });

  const result = await createReturn({
    orderNumber: body.orderNumber,
    reason: body.reason,
    returnType: body.returnType,
    notes: body.notes,
    actorId: staff.userId ?? undefined,
  });
  if (!result.ok) {
    const map: Record<string, number> = { order_not_found: 404, no_items: 422 };
    return NextResponse.json({ error: result.reason ?? "Could not create return." }, { status: map[result.reason ?? ""] ?? 422 });
  }
  return NextResponse.json(result);
}
