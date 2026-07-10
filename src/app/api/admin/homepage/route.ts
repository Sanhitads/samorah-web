import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCapability } from "@/lib/auth/requireStaff";
import { saveHomepageDraft, publishHomepage, resetHomepage, listHomepageRevisions, restoreHomepageRevision, HOMEPAGE_CACHE_TAG } from "@/services/homepageService";

/** POST /api/admin/homepage { action, ... } — Homepage Builder. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  switch (body.action) {
    case "save": return NextResponse.json(await saveHomepageDraft(body.sections, actor));
    case "publish": {
      if (body.sections) { const s = await saveHomepageDraft(body.sections, actor); if (!s.ok) return NextResponse.json(s, { status: 422 }); }
      const res = await publishHomepage({ publishAt: body.publishAt ?? null, unpublishAt: body.unpublishAt ?? null }, actor);
      if (res.ok) revalidateTag(HOMEPAGE_CACHE_TAG);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    case "reset": {
      const res = await resetHomepage(actor);
      if (res.ok) revalidateTag(HOMEPAGE_CACHE_TAG);
      return NextResponse.json(res);
    }
    case "revisions": return NextResponse.json({ ok: true, revisions: await listHomepageRevisions() });
    case "restore": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await restoreHomepageRevision(body.id, actor));
    }
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
