/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CMS service (Phase 5) — DB-driven storefront pages. getPage(slug) returns the
 * PUBLISHED cms_pages row, falling back to the config content when absent, so the
 * storefront works before seeding and becomes editable the moment a page is saved.
 * Admin CRUD keeps content out of code (the CMS-first goal).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { LEGAL } from "@/config/legalContent";
import { isLive } from "@/lib/cms/publishable";
import { snapshotRevision as snapshotCmsRevision, listRevisions as listCmsRevisions, getRevisionSnapshot } from "@/services/cms/revisions";
import type { EditorialFields } from "@/lib/cms/sections";

export type { SectionImage, SectionLayout, SectionRatio, SectionVariant, EditorialFields } from "@/lib/cms/sections";

/** A single FAQ question/answer. Answers may contain "\n"-separated lines (rendered as
 *  paragraphs; "- " lines become bullets). Used by the FAQ page AND by Product Care accordion
 *  sections — see PageSection.items. */
export interface FaqItem { q: string; a: string }
/** A content section. For legal/policy pages: heading + body paragraphs. For the FAQ page a
 *  section is a CATEGORY: `heading` = category name, `items` = its questions. For editorial pages
 *  (Product Care) a section may ALSO carry `EditorialFields` (step/label/image/layout/ratio/hidden).
 *  All additions are optional — text-only pages never set them, so they are unaffected (stored in
 *  the existing sections JSONB, no schema change). */
export interface PageSection extends EditorialFields { heading?: string; body: string[]; items?: FaqItem[] }
export type PageStatus = "draft" | "scheduled" | "published";
export interface CmsPage {
  slug: string;
  title: string;
  eyebrow: string;
  intro: string;
  sections: PageSection[];
  seo: { title?: string; description?: string; ogImage?: string };
  status: PageStatus;
  publishAt?: string | null;
  unpublishAt?: string | null;
  updatedAt?: string | null; // last save time (DB rows only) — powers the "Last updated" line
  createdAt?: string | null; // first-created (DB rows only) — the effective-date fallback
  form?: Record<string, unknown>; // page-type config (e.g. the Contact form) — stored in form_config JSONB
  source: "db" | "config";
}

/**
 * Read-time visibility for the storefront (R7). A page is live when its status +
 * schedule window both allow it, evaluated against now — so publish/unpublish
 * happen the instant the clock crosses the boundary, with no cron to fire or miss:
 *   published → live unless before publish_at or at/after unpublish_at
 *   scheduled → live only once now ≥ publish_at (and before unpublish_at)
 *   draft     → never live
 */
export function isPageLive(row: { status: string; publish_at?: string | null; unpublish_at?: string | null }, now = Date.now()): boolean {
  return isLive(row, now); // delegates to the shared Publishable rule (point 14)
}

function mapRow(data: any): CmsPage {
  return {
    slug: data.slug, title: data.title, eyebrow: data.eyebrow ?? "", intro: data.intro ?? "",
    sections: Array.isArray(data.sections) ? data.sections : [], seo: data.seo ?? {}, status: data.status,
    publishAt: data.publish_at ?? null, unpublishAt: data.unpublish_at ?? null, updatedAt: data.updated_at ?? null, createdAt: data.created_at ?? null, form: data.form_config ?? {}, source: "db",
  };
}

/** Public read — the DB page if its schedule says it's live now, else config fallback (LEGAL), else null. */
export async function getPage(slug: string): Promise<CmsPage | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_pages").select("*").eq("slug", slug).maybeSingle();
    if (data && isPageLive(data)) return mapRow(data);
    if (data) {
      // A DB row exists but isn't live (draft/scheduled/unpublished) — hide it.
      // We deliberately DON'T fall back to config here: once a page is managed in
      // the CMS, unpublishing it must actually hide it, not silently resurrect the
      // old hard-coded content.
      return null;
    }
  } catch {
    /* fall through to config */
  }
  const c = LEGAL[slug];
  if (!c) return null;
  return { slug, title: c.title, eyebrow: c.eyebrow, intro: c.intro ?? "", sections: c.sections, seo: {}, status: "published", source: "config" };
}

/** Admin row summary — includes live/schedule state so the list reflects reality. */
export interface PageListRow { slug: string; title: string; status: string; live: boolean; publishAt?: string | null; unpublishAt?: string | null; source: "db" | "config" }

/** Admin: all DB pages (with live/schedule state) + the config-only slugs (seedable). */
export async function listPagesAdmin(): Promise<PageListRow[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("cms_pages").select("slug,title,status,publish_at,unpublish_at").order("slug");
  const dbPages = (data ?? []) as any[];
  const dbSlugs = new Set(dbPages.map((p) => p.slug));
  const rows: PageListRow[] = dbPages.map((p) => ({
    slug: p.slug, title: p.title, status: p.status, live: isPageLive(p),
    publishAt: p.publish_at ?? null, unpublishAt: p.unpublish_at ?? null, source: "db" as const,
  }));
  for (const [slug, c] of Object.entries(LEGAL)) if (!dbSlugs.has(slug)) rows.push({ slug, title: c.title, status: "config", live: true, source: "config" as const });
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Admin: load a page for editing (DB row regardless of schedule, or config seed if none). */
export async function getPageForEdit(slug: string): Promise<CmsPage | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_pages").select("*").eq("slug", slug).maybeSingle();
    if (data) return mapRow(data);
  } catch { /* fall through */ }
  const c = LEGAL[slug];
  if (!c) return null;
  return { slug, title: c.title, eyebrow: c.eyebrow, intro: c.intro ?? "", sections: c.sections, seo: {}, status: "published", publishAt: null, unpublishAt: null, source: "config" };
}

export interface PageInput {
  slug: string; title: string; eyebrow?: string; intro?: string;
  sections: PageSection[]; seo?: { title?: string; description?: string; ogImage?: string };
  status?: PageStatus; publishAt?: string | null; unpublishAt?: string | null;
  form?: Record<string, unknown>; // page-type config (Contact form) → form_config JSONB
}

export async function upsertPage(input: PageInput, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!input.slug?.trim() || !input.title?.trim()) return { ok: false, reason: "slug and title required" };
  const db = createAdminClient() as any;
  const row = {
    slug: input.slug.trim(), title: input.title.trim(), eyebrow: input.eyebrow || null, intro: input.intro || null,
    sections: (input.sections ?? []).filter((s) => s.body?.length || s.heading || s.items?.length || s.image?.url), seo: input.seo ?? {},
    status: input.status ?? "published", publish_at: input.publishAt || null, unpublish_at: input.unpublishAt || null,
    form_config: input.form ?? {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("cms_pages").upsert(row, { onConflict: "slug" });
  if (error) return { ok: false, reason: error.message };
  await snapshotCmsRevision("page", row.slug, row, actorId); // shared revision store (point 14)
  await logEvent({ entityType: "settings", event: "cms.page_saved", actorType: actorId ? "staff" : "system", actorId, notes: input.slug });
  return { ok: true };
}

export interface PageRevision {
  id: string; slug: string; title: string; status: PageStatus; actorId?: string | null; createdAt: string;
}

/** Admin: revision history for a page, newest first (from the shared cms_revisions store). */
export async function listRevisions(slug: string, limit = 30): Promise<PageRevision[]> {
  const revs = await listCmsRevisions("page", slug, limit);
  return revs.map((r) => ({ id: r.id, slug, title: r.snapshot?.title ?? slug, status: r.snapshot?.status ?? "published", actorId: r.actorId, createdAt: r.createdAt }));
}

/** Admin: restore a past revision — writes its snapshot back as a new current version. */
export async function restoreRevision(revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!snap) return { ok: false, reason: "revision not found" };
  const res = await upsertPage({
    slug: snap.slug, title: snap.title, eyebrow: snap.eyebrow ?? "", intro: snap.intro ?? "",
    sections: Array.isArray(snap.sections) ? snap.sections : [], seo: snap.seo ?? {}, status: snap.status,
    publishAt: snap.publish_at ?? null, unpublishAt: snap.unpublish_at ?? null,
  }, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "cms.page_restored", actorType: actorId ? "staff" : "system", actorId, notes: `${snap.slug} ← ${revisionId}` });
  return res;
}

export async function deletePage(slug: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("cms_pages").delete().eq("slug", slug);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "cms.page_deleted", actorType: actorId ? "staff" : "system", actorId, notes: slug });
  return { ok: true };
}
