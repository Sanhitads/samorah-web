import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { setOrderNote, setOrderTags, resendConfirmation } from "@/services/orderAdminService";

/**
 * POST /api/admin/orders/meta { action, id, ... } — order annotations + resend.
 * Notes/tags = fulfillment.triage; resend email = fulfillment.operate.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cap = body.action === "resend" ? "fulfillment.operate" : "fulfillment.triage";
  const staff = await requireCapability(cap);
  if (!staff.ok) return NextResponse.json({ error: `Forbidden — ${cap} required.` }, { status: 403 });
  const a = staff.userId ?? undefined;

  try {
    switch (body.action) {
      case "note": return NextResponse.json(await setOrderNote(body.id, String(body.note ?? ""), a));
      case "tags": return NextResponse.json(await setOrderTags(body.id, Array.isArray(body.tags) ? body.tags : [], a));
      case "resend": return NextResponse.json(await resendConfirmation(body.id, a));
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
