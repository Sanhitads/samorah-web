import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { saveEmailTemplate } from "@/services/emailTemplateService";

/** POST /api/admin/emails { key, patch } — edit transactional email templates. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
  return NextResponse.json(await saveEmailTemplate(body.key, body.patch ?? {}, staff.userId ?? undefined));
}
