import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { setCustomerNotes, setCustomerTags } from "@/services/customerAdminService";

/** POST /api/admin/customers { action, id, ... } — CRM notes/tags. analytics.view (manager+). */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("analytics.view");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — analytics.view required." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const a = staff.userId ?? undefined;
  try {
    switch (body.action) {
      case "note": return NextResponse.json(await setCustomerNotes(body.id, String(body.note ?? ""), a));
      case "tags": return NextResponse.json(await setCustomerTags(body.id, Array.isArray(body.tags) ? body.tags : [], a));
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
