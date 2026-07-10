import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCapability } from "@/lib/auth/requireStaff";
import { saveDraft, publishMenu, resetMenu, listMenuRevisions, restoreMenuRevision, type MenuId } from "@/services/navigationService";
import { validateMenu } from "@/lib/cms/navValidation";

/** POST /api/admin/navigation { action, menu, ... } — edit header/footer menus. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const menu = body.menu as MenuId;
  if (menu !== "header" && menu !== "footer") return NextResponse.json({ error: "menu must be header or footer" }, { status: 400 });

  switch (body.action) {
    case "save": {
      // Sanitize + soft-validate on save; hard-block only on publish.
      const v = await validateMenu(menu, body.data);
      return NextResponse.json({ ...(await saveDraft(menu, v.clean, actor)), warnings: v.warnings });
    }
    case "publish": {
      const v = await validateMenu(menu, body.data ?? undefined, { fetchLatest: !body.data });
      if (v.errors.length) return NextResponse.json({ ok: false, reason: v.errors[0], errors: v.errors, warnings: v.warnings }, { status: 422 });
      if (body.data) { const s = await saveDraft(menu, v.clean, actor); if (!s.ok) return NextResponse.json(s, { status: 422 }); }
      const res = await publishMenu(menu, { publishAt: body.publishAt ?? null, unpublishAt: body.unpublishAt ?? null }, actor);
      if (res.ok) revalidateTag("navigation");
      return NextResponse.json({ ...res, warnings: v.warnings });
    }
    case "reset": {
      const res = await resetMenu(menu, actor);
      if (res.ok) revalidateTag("navigation");
      return NextResponse.json(res);
    }
    case "revisions": return NextResponse.json({ ok: true, revisions: await listMenuRevisions(menu) });
    case "restore": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await restoreMenuRevision(menu, body.id, actor));
    }
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
