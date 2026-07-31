import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCapability } from "@/lib/auth/requireStaff";
import { COMPOSABLE_PAGES } from "@/config/composablePages";
import { savePageDraft, publishPage, publishPageSections, resetPage, listPageRevisions, restorePageRevision, getPageAdmin, pageCacheTag } from "@/services/pageComposerService";
import { getRevisionSnapshot } from "@/services/cms/revisions";
import { validateComposedPage } from "@/lib/cms/composedPageValidation";
import { listSectionTemplates, saveSectionTemplate, deleteSectionTemplate } from "@/services/sectionLibraryService";
import { savePagePreset, deletePagePreset } from "@/services/pagePresetsService";
import { getPageAudit } from "@/services/pageAuditService";

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
    // Publish only selected sections (point 13). Save the draft, validate ONLY the selected sections,
    // then merge them into the live published version.
    case "publish.sections": {
      const ids: string[] = Array.isArray(body.sectionIds) ? body.sectionIds : [];
      if (body.sections) { const s = await savePageDraft(key, page.cfg, body.sections, actor); if (!s.ok) return NextResponse.json(s, { status: 422 }); }
      const draft = body.sections ?? (await getPageAdmin(key, page.cfg)).draft;
      const selected = (draft as { id: string }[]).filter((s) => ids.includes(s.id));
      const v = validateComposedPage(key, selected as never);
      const errors = v.errors.filter((e) => !/at least one section/i.test(e)); // the ≥1-enabled rule is checked at publish
      if (errors.length) return NextResponse.json({ ok: false, reason: errors[0], errors }, { status: 422 });
      const res = await publishPageSections(key, page.cfg, ids, actor);
      if (res.ok) revalidateTag(pageCacheTag(key));
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    case "revisions": return NextResponse.json({ ok: true, revisions: await listPageRevisions(key) });
    case "revision.get": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const snapshot = await getRevisionSnapshot(body.id);
      return NextResponse.json({ ok: true, snapshot: Array.isArray(snapshot) ? snapshot : [] });
    }
    case "restore": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await restorePageRevision(key, page.cfg, body.id, actor));
    }
    // Restore a version straight to LIVE (one-click undo of a bad publish): load the snapshot into the
    // draft AND publish it as the full page.
    case "restore.publish": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const snap = await getRevisionSnapshot(body.id);
      if (!Array.isArray(snap) || !snap.length) return NextResponse.json({ ok: false, reason: "revision not found or empty" }, { status: 422 });
      const saved = await savePageDraft(key, page.cfg, snap, actor);
      if (!saved.ok) return NextResponse.json(saved, { status: 422 });
      const res = await publishPage(key, page.cfg, {}, actor);
      if (res.ok) revalidateTag(pageCacheTag(key));
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    // Reusable Section Library (point 9) — global across composed pages; returns the fresh list so the
    // builder can update in place without a full reload.
    case "library.save": {
      const res = await saveSectionTemplate({ name: body.name, type: body.type, settings: body.settings ?? {} }, actor);
      return NextResponse.json({ ...res, library: await listSectionTemplates() });
    }
    case "library.delete": {
      const res = await deleteSectionTemplate(body.id, actor);
      return NextResponse.json({ ...res, library: await listSectionTemplates() });
    }
    // Page presets + seasonal homepages (points 29/30). Save the current composition as a named/seasonal
    // preset, or delete one. "Apply" (load into draft) is client-side; "Activate" reuses the publish action.
    case "preset.save": return NextResponse.json(await savePagePreset({ pageKey: key, name: body.name, season: body.season, sections: body.sections ?? [] }, actor));
    case "preset.delete": return NextResponse.json(await deletePagePreset(body.id, key, actor));
    // Audit timeline (point 35) — every change with who/what/when/prev/new.
    case "audit.timeline": return NextResponse.json({ ok: true, audit: await getPageAudit(key, 50) });
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
