import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCapability } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { saveDraft, publishMenu, resetMenu, listMenuRevisions, restoreMenuRevision, saveFooterMeta, type MenuId } from "@/services/navigationService";
import { validateMenu } from "@/lib/cms/navValidation";

/**
 * POST /api/admin/navigation { action, menu, ... } — edit header/footer menus.
 * RBAC split (Phase 1 · point 9): drafting needs `content.edit`; anything that changes the LIVE
 * storefront (publish / schedule / unpublish / reset) additionally needs `content.publish`. Enforced
 * here on the server, not merely by hiding buttons.
 */
export const runtime = "nodejs";
const LIVE_CHANGING = new Set(["publish", "reset", "save-footer-meta"]); // actions that alter what customers see

export async function POST(request: Request) {
  // Everyone reaching this route must at least be able to edit drafts.
  const staff = await requireCapability("content.edit");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — content.edit required." }, { status: 403 });
  const actor = staff.userId ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const menu = body.menu as MenuId;
  if (menu !== "header" && menu !== "footer") return NextResponse.json({ error: "menu must be header or footer" }, { status: 400 });

  // Live-changing actions require the distinct publish capability — editing never implies publishing.
  if (LIVE_CHANGING.has(body.action) && !hasCapability(staff.role, "content.publish")) {
    return NextResponse.json({ error: "Forbidden — content.publish required to change the live storefront." }, { status: 403 });
  }

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
    case "save-footer-meta": { // footer editorial text (tagline / copyright / made-in) — live on save
      const res = await saveFooterMeta(body.meta ?? {}, actor);
      if (res.ok) revalidateTag("navigation"); // footer text renders in the store layout alongside nav
      return NextResponse.json(res);
    }
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
