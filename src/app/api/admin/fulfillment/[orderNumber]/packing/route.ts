import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getPackingChecklist } from "@/services/fulfillmentService";

/** GET /api/admin/fulfillment/[orderNumber]/packing — the required packing items + checked state,
 *  for the pack panel. Read-only; staff (editor+). */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderNumber } = await params;
  return NextResponse.json({ ok: true, ...(await getPackingChecklist(orderNumber)) });
}
