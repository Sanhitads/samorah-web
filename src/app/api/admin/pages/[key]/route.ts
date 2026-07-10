import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCapability } from "@/lib/auth/requireStaff";
import { COMPOSABLE_PAGES } from "@/config/composablePages";
import { savePageDraft, publishPage, resetPage, listPageRevisions, restorePageRevision, getPageAdmin, pageCacheTag } from "@/services/pageComposerService";
import { validateComposedPage } from "@/lib/cms/composedPageValidation";

/** POST /api/admin/pages/[key] — generic Composable Page builder for any page type. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const page = COMPOSABLE_PAGES[key];
  if (!page) return NextResponse.json({ error: "Unknown page" }, { status: 404 });

  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  switch (body.action) {
    case "save": return NextResponse.json(await savePageDraft(key, page.cfg, body.sections, actor));
    case "publish": {
      const sections = body.sections ?? (await getPageAdmin(key, page.cfg)).draft;
      const v = validateComposedPage(key, sections);
      if (v.errors.length) return NextResponse.json({ ok: false, reason: v.errors[0], errors: v.errors, warnings: v.warnings }, { status: 422 });
      if (body.sections) { const s = await savePageDraft(key, page.cfg, body.sections, actor); if (!s.ok) return NextResponse.json(s, { status: 422 }); }
      const res = await publishPage(key, page.cfg, { publishAt: body.publishAt ?? null, unpublishAt: body.unpublishAt ?? null }, actor);
      if (res.ok) revalidateTag(pageCacheTag(key));
      return NextResponse.json({ ...res, warnings: v.warnings }, { status: res.ok ? 200 : 422 });
    }
    case "reset": {
      const res = await resetPage(key, actor);
      if (res.ok) revalidateTag(pageCacheTag(key));
      return NextResponse.json(res);
    }
    case "revisions": return NextResponse.json({ ok: true, revisions: await listPageRevisions(key) });
    case "restore": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await restorePageRevision(key, page.cfg, body.id, actor));
    }
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
