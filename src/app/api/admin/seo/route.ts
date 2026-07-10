import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { upsertRedirect, deleteRedirect, upsertSeoOverride, deleteSeoOverride } from "@/services/seoRedirectService";

/** POST /api/admin/seo { action, ... } — redirects + SEO overrides. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  switch (body.action) {
    case "redirect.save": return NextResponse.json(await upsertRedirect(body.redirect ?? {}, actor));
    case "redirect.delete": return NextResponse.json(await deleteRedirect(body.id, actor));
    case "seo.save": return NextResponse.json(await upsertSeoOverride(body.seo ?? {}, actor));
    case "seo.delete": return NextResponse.json(await deleteSeoOverride(body.path, actor));
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
