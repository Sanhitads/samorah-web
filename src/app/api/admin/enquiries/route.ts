import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceEnquiry, updateEnquiryRecord } from "@/services/enquiryService";
import { isEnquiryStatus } from "@/lib/enquiries/state";

/** POST /api/admin/enquiries { action, id, ... } — enquiry workflow. enquiries.manage. */
export const runtime = "nodejs";

async function staffName(id?: string | null): Promise<string | undefined> {
  if (!id) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("users").select("full_name,email").eq("id", id).maybeSingle();
    return data?.full_name || data?.email || undefined;
  } catch { return undefined; }
}

export async function POST(request: Request) {
  const staff = await requireCapability("enquiries.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — enquiries.manage required." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const actor = { id: staff.userId ?? undefined };

  try {
    switch (body.action) {
      case "status": {
        if (!isEnquiryStatus(String(body.status))) return NextResponse.json({ error: "unknown status" }, { status: 400 });
        return NextResponse.json(await advanceEnquiry(body.id, body.status, actor));
      }
      case "assign": {
        const assignToMe = body.assignTo === "me";
        const name = assignToMe ? await staffName(staff.userId) : null;
        return NextResponse.json(await updateEnquiryRecord(body.id, { assigneeId: assignToMe ? staff.userId : null, assigneeName: name }, { id: staff.userId ?? undefined, name: name ?? undefined }));
      }
      case "note":
        return NextResponse.json(await updateEnquiryRecord(body.id, { adminNotes: String(body.adminNotes ?? "") }, actor));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
