import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { saveEmailTemplate, EMAIL_TEMPLATE_DEFS } from "@/services/emailTemplateService";
import { renderEmailBlocks } from "@/lib/email/blocks";

/** POST /api/admin/emails { action, key, patch } — edit / preview email templates. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  if (body.action === "preview") {
    const def = EMAIL_TEMPLATE_DEFS.find((d) => d.key === body.key);
    const vars = { ...(def?.sample ?? {}), details: `<tr><td style="padding:8px 40px;text-align:center;color:#6b6259;font:italic 13px Georgia;">[ order details render here ]</td></tr>` };
    const { html } = renderEmailBlocks({ subject: body.patch?.subject ?? "", preheader: body.patch?.preheader, eyebrow: body.patch?.eyebrow, heading: body.patch?.heading, blocks: body.patch?.blocks ?? [] }, vars);
    return NextResponse.json({ ok: true, html });
  }
  return NextResponse.json(await saveEmailTemplate(body.key, body.patch ?? {}, staff.userId ?? undefined));
}
