/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Navigation service (CMS slice 3) — now a PUBLISHABLE resource (review points
 * 1·2·3·8·14): it carries a draft (being edited), a published tree (live), a
 * publish window, and revision history via the shared cms_revisions store. The
 * storefront reads the live tree (schedule-aware) with a config fallback, so menus
 * keep working before seeding.
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { MENU_BRANCHES, FOOTER_SECTIONS } from "@/config/navigation";
import { isLive, publishState, type PublishStatus } from "@/lib/cms/publishable";
import { snapshotRevision, listRevisions as listCmsRevisions, getRevisionSnapshot, type Revision } from "@/services/cms/revisions";

/** Cache tag for the live navigation — invalidated via revalidateTag on publish/reset. */
export const NAV_CACHE_TAG = "navigation";

/** Entity-based link target (review point 5) — store what it POINTS TO, not a URL. */
export type EntityType = "page" | "chapter" | "collection" | "product";
export interface LinkEntity { type: EntityType; id: string; label?: string } // id = slug

/** Shared link attributes across nav + footer: entity linking (5), SEO (11), i18n (7). */
export interface LinkAttrs {
  linkType?: "url" | "entity";
  entity?: LinkEntity;
  target?: "_blank";
  nofollow?: boolean;
  labelI18n?: Record<string, string>; // localisation-ready; empty today
}
export interface NavItem extends LinkAttrs { label: string; href?: string; isComingSoon?: boolean; tier?: "parent" | "child" | "cta" }
export interface NavCampaign { eyebrow: string; title: string; description: string; href: string; gradient: string; mediaId?: string; image?: string }
export interface NavBranch { id: string; label: string; items: NavItem[]; campaign: NavCampaign }
export interface FooterLink extends LinkAttrs { label: string; href?: string; external?: boolean }
export interface FooterSection { title: string; links: FooterLink[] }
export interface Navigation { branches: NavBranch[]; footer: FooterSection[] }

/** Route templates per entity type — the ONE place a section's URL shape lives, so
 *  moving /collections → /chapters is a code change here, not a nav re-edit (pt 5). */
export const ENTITY_ROUTE: Record<EntityType, (slug: string) => string> = {
  page: (s) => `/${s}`,
  chapter: (s) => `/chapters/${s}`,
  collection: (s) => `/collections/${s}`,
  product: (s) => `/shop/${s}`,
};
const DEFAULT_LOCALE = "en";

/** Resolve a link's final href — entity links compute their URL from the route map. */
export function resolveHref(o: LinkAttrs & { href?: string }): string {
  if (o.linkType === "entity" && o.entity) return ENTITY_ROUTE[o.entity.type]?.(o.entity.id) ?? "#";
  return o.href ?? "#";
}
/** Localisation-ready label accessor (pt 7) — no-op today, seam for later locales. */
export function resolveLabel(o: { label: string; labelI18n?: Record<string, string> }, locale = DEFAULT_LOCALE): string {
  return o.labelI18n?.[locale] ?? o.label;
}
/** SEO rel string (pt 11) — nofollow + safe rel for new-tab links. */
export function relOf(o: LinkAttrs & { external?: boolean }): string | undefined {
  const parts: string[] = [];
  if (o.nofollow) parts.push("nofollow");
  if (o.target === "_blank" || o.external) parts.push("noopener", "noreferrer");
  return parts.length ? [...new Set(parts)].join(" ") : undefined;
}

export type MenuId = "header" | "footer";
interface MenuRow { id: MenuId; draft: any; published: any; status: string; publish_at: string | null; unpublish_at: string | null }

async function readRow(id: MenuId): Promise<MenuRow | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("navigation_menus").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  } catch { return null; }
}

/** The tree the storefront should render NOW (schedule-aware), or null → config. */
function liveTree(row: MenuRow | null): any[] | null {
  if (!row) return null;
  if (row.status === "scheduled") {
    const t = isLive(row) ? row.draft : row.published; // before publish_at keep current; after, show scheduled draft
    return Array.isArray(t) && t.length ? t : null;
  }
  if (row.status === "published") {
    return isLive(row) && Array.isArray(row.published) && row.published.length ? row.published : null;
  }
  return null; // draft-only → config fallback
}

/** Resolve any campaign.mediaId → a concrete image URL (single-source assets). */
async function resolveCampaignImages(branches: NavBranch[]): Promise<void> {
  const ids = [...new Set(branches.map((b) => b.campaign?.mediaId).filter(Boolean) as string[])];
  if (!ids.length) return;
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("media").select("id,url").in("id", ids);
    const url = new Map<string, string>((data ?? []).map((m: any) => [m.id, m.url]));
    for (const b of branches) if (b.campaign?.mediaId) b.campaign.image = url.get(b.campaign.mediaId) ?? b.campaign.image;
  } catch { /* imagery optional; gradient fallback covers it */ }
}

/**
 * Public read — the live tree if published/scheduled says so, else config.
 * `preview: true` (staff-gated by the caller) returns the DRAFT instead, so staff
 * can see unpublished/seasonal menus before they go live (review point 3).
 */
/** Compute final href + localised label for every link (entity resolution, i18n). */
function resolveLinks(branches: NavBranch[], footer: FooterSection[]): void {
  for (const b of branches) for (const it of b.items) { it.href = resolveHref(it); it.label = resolveLabel(it); }
  for (const s of footer) for (const l of s.links) { l.href = resolveHref(l); l.label = resolveLabel(l); }
}

async function resolveNavigation(preview: boolean): Promise<Navigation> {
  const [header, footer] = await Promise.all([readRow("header"), readRow("footer")]);
  const pick = (row: MenuRow | null, fallback: any[]) => {
    const tree = (preview && row?.draft?.length) ? row.draft : (liveTree(row) ?? fallback);
    return JSON.parse(JSON.stringify(tree)); // clone — never mutate config/cache in place
  };
  const branches = pick(header, MENU_BRANCHES as any) as NavBranch[];
  const footerSections = pick(footer, FOOTER_SECTIONS as any) as FooterSection[];
  resolveLinks(branches, footerSections);
  await resolveCampaignImages(branches);
  return { branches, footer: footerSections };
}

/**
 * Live navigation, cached (review point 12) — nav renders on EVERY page, so we
 * cache the resolved tree under the `navigation` tag instead of hitting the DB per
 * request. Publish/reset call revalidateTag(NAV_CACHE_TAG) to refresh instantly.
 */
const getLiveNavigation = unstable_cache(() => resolveNavigation(false), ["navigation-live"], { tags: [NAV_CACHE_TAG], revalidate: 3600 });

/**
 * Public read. `preview: true` (staff-gated by the caller) bypasses the cache and
 * returns the DRAFT, so staff can see unpublished/seasonal menus before they go
 * live (review point 3).
 */
export async function getNavigation(opts: { preview?: boolean } = {}): Promise<Navigation> {
  return opts.preview ? resolveNavigation(true) : getLiveNavigation();
}

// ── Linkable entities (for the entity-link picker, pt 5) ─────────────────────
export interface EntityOption { id: string; label: string }
export type LinkableEntities = Record<EntityType, EntityOption[]>;

/** Entities an editor can point a link at — resolved to current slugs. */
export async function listLinkableEntities(): Promise<LinkableEntities> {
  const { HOME_CHAPTERS } = await import("@/config/chapters");
  const { AIR_VOLUMES } = await import("@/config/theHours");
  const { listPagesAdmin } = await import("@/services/cmsService");
  const pages = await listPagesAdmin();
  let products: EntityOption[] = [];
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("products").select("slug,name,status").eq("status", "active").order("name").limit(200);
    products = (data ?? []).map((p: any) => ({ id: p.slug, label: p.name }));
  } catch { /* products optional */ }
  return {
    page: pages.map((p) => ({ id: p.slug, label: p.title })),
    chapter: HOME_CHAPTERS.map((c: any) => ({ id: c.slug, label: c.title })),
    collection: AIR_VOLUMES.map((v: any) => ({ id: v.slug, label: v.title })),
    product: products,
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────
export interface MenuAdminView { draft: any[]; published: any[] | null; status: PublishStatus; state: string; publishAt: string | null; unpublishAt: string | null; source: "db" | "config" }

export async function getNavigationAdmin(): Promise<{ header: MenuAdminView; footer: MenuAdminView }> {
  const [h, f] = await Promise.all([readRow("header"), readRow("footer")]);
  const view = (row: MenuRow | null, config: any[]): MenuAdminView => ({
    draft: (row?.draft ?? config) as any[],
    published: (row?.published ?? null) as any[] | null,
    status: (row?.status ?? "published") as PublishStatus,
    state: row ? publishState(row) : "default",
    publishAt: row?.publish_at ?? null, unpublishAt: row?.unpublish_at ?? null,
    source: row ? "db" : "config",
  });
  return { header: view(h, MENU_BRANCHES as any), footer: view(f, FOOTER_SECTIONS as any) };
}

/** Save the DRAFT (work in progress) — does NOT go live until Publish. */
export async function saveDraft(id: MenuId, data: unknown, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!Array.isArray(data)) return { ok: false, reason: "menu must be a list" };
  const db = createAdminClient() as any;
  const existing = await readRow(id);
  const row = { id, draft: data, published: existing?.published ?? null, status: "draft", updated_at: new Date().toISOString() };
  const { error } = await db.from("navigation_menus").upsert(row, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "navigation.draft_saved", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/** Publish the current draft (optionally scheduled). Snapshots a revision. */
export async function publishMenu(id: MenuId, opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow(id);
  if (!existing?.draft) return { ok: false, reason: "nothing to publish" };
  const scheduled = opts.publishAt && Date.parse(opts.publishAt) > Date.now();
  const db = createAdminClient() as any;
  const row = {
    id, draft: existing.draft,
    published: scheduled ? existing.published : existing.draft, // scheduled: keep current live until publish_at
    status: scheduled ? "scheduled" : "published",
    publish_at: opts.publishAt || null, unpublish_at: opts.unpublishAt || null, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("navigation_menus").upsert(row, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision("navigation", id, existing.draft, actorId, scheduled ? "scheduled publish" : undefined);
  await logEvent({ entityType: "settings", event: scheduled ? "navigation.scheduled" : "navigation.published", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/** Reset a menu back to the code config (delete the DB override). */
export async function resetMenu(id: MenuId, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("navigation_menus").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "navigation.reset", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

// ── Revisions (shared store) ─────────────────────────────────────────────────
export async function listMenuRevisions(id: MenuId, limit = 30): Promise<Revision[]> {
  return listCmsRevisions("navigation", id, limit);
}

/** Restore a revision into the DRAFT (non-destructive — review before re-publishing). */
export async function restoreMenuRevision(id: MenuId, revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!Array.isArray(snap)) return { ok: false, reason: "revision not found" };
  const res = await saveDraft(id, snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "navigation.restored", actorType: actorId ? "staff" : "system", actorId, notes: `${id} ← ${revisionId}` });
  return res;
}
