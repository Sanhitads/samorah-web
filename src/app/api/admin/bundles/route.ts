import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import {
  getBundleAdmin,
  saveBundleDraft,
  publishBundle,
  resetBundleToDefault,
  listBundleRevisions,
  getBundleRevision,
  restoreBundleRevisionToDraft,
  restoreBundleRevisionAndPublish,
} from "@/services/bundleAdminService";

/**
 * POST /api/admin/bundles { action, config?, revisionId? } — Bundle CMS admin.
 * RBAC mirrors the navigation/emails convention (NOT catalog.manage): every action requires content.edit;
 * actions that change storefront-LIVE state additionally require content.publish. Server-enforced.
 *   content.edit  → load, save, revisions, revision.get, restore (to draft), reset (draft-only)
 *   content.publish → publish, restore.publish (and any live-changing action)
 */
export const runtime = "nodejs";

const LIVE_CHANGING = new Set(["publish", "restore.publish"]);

export async function POST(request: Request) {
  let body: { action?: string; config?: unknown; revisionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = body.action ?? "";

  const staff = await requireCapability("content.edit");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — content.edit required." }, { status: 403 });
  if (LIVE_CHANGING.has(action) && !hasCapability(staff.role, "content.publish")) {
    return NextResponse.json({ error: "Forbidden — content.publish required to change the live storefront." }, { status: 403 });
  }
  const actorId = staff.userId ?? undefined;

  try {
    switch (action) {
      case "load":
        return NextResponse.json(await getBundleAdmin());
      case "save": {
        const r = await saveBundleDraft(body.config, actorId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 });
      }
      case "reset": {
        const r = await resetBundleToDefault(actorId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 });
      }
      case "revisions":
        return NextResponse.json({ ok: true, revisions: await listBundleRevisions() });
      case "revision.get": {
        if (!body.revisionId) return NextResponse.json({ error: "revisionId required." }, { status: 400 });
        return NextResponse.json({ ok: true, config: await getBundleRevision(body.revisionId) });
      }
      case "restore": {
        if (!body.revisionId) return NextResponse.json({ error: "revisionId required." }, { status: 400 });
        const r = await restoreBundleRevisionToDraft(body.revisionId, actorId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 });
      }
      case "publish": {
        const r = await publishBundle(body.config, actorId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 }); // validation ERROR → 422, published untouched
      }
      case "restore.publish": {
        if (!body.revisionId) return NextResponse.json({ error: "revisionId required." }, { status: 400 });
        const r = await restoreBundleRevisionAndPublish(body.revisionId, actorId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
