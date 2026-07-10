import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { upsertPage, deletePage, getPageForEdit, listRevisions, restoreRevision, type PageInput } from "@/services/cmsService";

/** POST /api/admin/content { action, ... } — CMS page CRUD. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const a = staff.userId ?? undefined;
  try {
    switch (body.action) {
      case "get": return NextResponse.json({ ok: true, page: await getPageForEdit(body.slug) });
      case "save": return NextResponse.json(await upsertPage(body.page as PageInput, a));
      case "revisions": return NextResponse.json({ ok: true, revisions: await listRevisions(body.slug) });
      case "restore":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await restoreRevision(body.id, a));
      case "delete":
        if (!body.slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
        return NextResponse.json(await deletePage(body.slug, a));
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
