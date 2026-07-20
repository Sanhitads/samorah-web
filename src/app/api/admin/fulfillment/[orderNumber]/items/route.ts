import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getOrderPickItems } from "@/services/fulfillmentService";

/** GET /api/admin/fulfillment/[orderNumber]/items — the order's lines + per-item pick state, for the
 *  pick panel. Read-only; staff (editor+). */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderNumber } = await params;
  const items = await getOrderPickItems(orderNumber);
  return NextResponse.json({ ok: true, items });
}
