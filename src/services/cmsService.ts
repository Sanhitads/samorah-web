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

export interface PageSection { heading?: string; body: string[] }
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
  const pub = row.publish_at ? Date.parse(row.publish_at) : null;
  const unpub = row.unpublish_at ? Date.parse(row.unpublish_at) : null;
  if (unpub !== null && now >= unpub) return false;
  if (row.status === "published") return pub === null || now >= pub;
  if (row.status === "scheduled") return pub !== null && now >= pub;
  return false;
}

function mapRow(data: any): CmsPage {
  return {
    slug: data.slug, title: data.title, eyebrow: data.eyebrow ?? "", intro: data.intro ?? "",
    sections: Array.isArray(data.sections) ? data.sections : [], seo: data.seo ?? {}, status: data.status,
    publishAt: data.publish_at ?? null, unpublishAt: data.unpublish_at ?? null, source: "db",
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
}

export async function upsertPage(input: PageInput, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!input.slug?.trim() || !input.title?.trim()) return { ok: false, reason: "slug and title required" };
  const db = createAdminClient() as any;
  const row = {
    slug: input.slug.trim(), title: input.title.trim(), eyebrow: input.eyebrow || null, intro: input.intro || null,
    sections: (input.sections ?? []).filter((s) => s.body?.length || s.heading), seo: input.seo ?? {},
    status: input.status ?? "published", publish_at: input.publishAt || null, unpublish_at: input.unpublishAt || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("cms_pages").upsert(row, { onConflict: "slug" });
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision(row, actorId);
  await logEvent({ entityType: "settings", event: "cms.page_saved", actorType: actorId ? "staff" : "system", actorId, notes: input.slug });
  return { ok: true };
}

/** Snapshot a committed version into the revision log (R3). Non-blocking on failure. */
async function snapshotRevision(row: any, actorId?: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db.from("cms_page_revisions").insert({
      slug: row.slug, title: row.title, eyebrow: row.eyebrow, intro: row.intro,
      sections: row.sections, seo: row.seo, status: row.status,
      publish_at: row.publish_at ?? null, unpublish_at: row.unpublish_at ?? null, actor_id: actorId ?? null,
    });
  } catch { /* history is best-effort; never block a save */ }
}

export interface PageRevision {
  id: string; slug: string; title: string; eyebrow: string; intro: string;
  sections: PageSection[]; seo: CmsPage["seo"]; status: PageStatus;
  publishAt?: string | null; unpublishAt?: string | null; actorId?: string | null; createdAt: string;
}

/** Admin: revision history for a page, newest first. */
export async function listRevisions(slug: string, limit = 30): Promise<PageRevision[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("cms_page_revisions").select("*").eq("slug", slug).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id, slug: r.slug, title: r.title, eyebrow: r.eyebrow ?? "", intro: r.intro ?? "",
    sections: Array.isArray(r.sections) ? r.sections : [], seo: r.seo ?? {}, status: r.status,
    publishAt: r.publish_at ?? null, unpublishAt: r.unpublish_at ?? null, actorId: r.actor_id ?? null, createdAt: r.created_at,
  }));
}

/** Admin: restore a past revision — writes its content back as a new current version. */
export async function restoreRevision(revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { data: rev } = await db.from("cms_page_revisions").select("*").eq("id", revisionId).maybeSingle();
  if (!rev) return { ok: false, reason: "revision not found" };
  const res = await upsertPage({
    slug: rev.slug, title: rev.title, eyebrow: rev.eyebrow ?? "", intro: rev.intro ?? "",
    sections: Array.isArray(rev.sections) ? rev.sections : [], seo: rev.seo ?? {}, status: rev.status,
    publishAt: rev.publish_at ?? null, unpublishAt: rev.unpublish_at ?? null,
  }, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "cms.page_restored", actorType: actorId ? "staff" : "system", actorId, notes: `${rev.slug} ← ${revisionId}` });
  return res;
}

export async function deletePage(slug: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("cms_pages").delete().eq("slug", slug);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "cms.page_deleted", actorType: actorId ? "staff" : "system", actorId, notes: slug });
  return { ok: true };
}
