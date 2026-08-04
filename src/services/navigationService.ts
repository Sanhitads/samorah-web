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
import { snapshotRevision, listRevisions as listCmsRevisions, getRevisionSnapshot, latestRevisionId, type Revision } from "@/services/cms/revisions";

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
// Campaign panels are entity-linkable too (point 1) — extends LinkAttrs so its href can come from an entity.
export interface NavCampaign extends LinkAttrs { eyebrow: string; title: string; description: string; href: string; gradient: string; mediaId?: string; image?: string }
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
interface MenuRow { id: MenuId; draft: any; published: any; status: string; publish_at: string | null; unpublish_at: string | null; published_revision_id?: string | null; predecessor_revision_id?: string | null }

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
  for (const b of branches) {
    for (const it of b.items) { it.href = resolveHref(it); it.label = resolveLabel(it); }
    if (b.campaign) b.campaign.href = resolveHref(b.campaign); // entity-linked campaign resolves its URL too
  }
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
  const header = view(h, MENU_BRANCHES as any);
  // Resolve campaign mediaId → thumbnail URL so the editor shows a preview (media stays referenced by id).
  try { await resolveCampaignImages(header.draft as NavBranch[]); } catch { /* thumbnails optional */ }
  return { header, footer: view(f, FOOTER_SECTIONS as any) };
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

/** Publish the current draft (optionally scheduled). Snapshots a revision + records the predecessor it
 *  displaces so a later scheduled unpublish can revert to it (points 10·11). */
export async function publishMenu(id: MenuId, opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow(id);
  if (!existing?.draft) return { ok: false, reason: "nothing to publish" };
  // Schedule window must be coherent: unpublish strictly after publish (or after now, for an immediate publish).
  if (opts.unpublishAt) {
    const pubTs = opts.publishAt ? Date.parse(opts.publishAt) : Date.now();
    if (!(Date.parse(opts.unpublishAt) > pubTs)) return { ok: false, reason: "Unpublish time must be after the publish time." };
  }
  const scheduled = !!(opts.publishAt && Date.parse(opts.publishAt) > Date.now());
  const db = createAdminClient() as any;
  // Snapshot the tree being published into the immutable revision store; capture its id for the pointers.
  const newRev = await snapshotRevision("navigation", id, existing.draft, actorId, scheduled ? "scheduled publish" : undefined);
  const predecessor = existing.published_revision_id ?? null; // the revision this publication displaces
  const row = {
    id, draft: existing.draft,
    published: scheduled ? existing.published : existing.draft, // scheduled: keep current live until publish_at (cron activates)
    status: scheduled ? "scheduled" : "published",
    // Immediate publish is live now → point at the new revision. Scheduled keeps the current live revision
    // until the cron activates it; either way the predecessor it will displace is the current live one.
    published_revision_id: scheduled ? (existing.published_revision_id ?? null) : newRev,
    predecessor_revision_id: predecessor,
    publish_at: opts.publishAt || null, unpublish_at: opts.unpublishAt || null, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("navigation_menus").upsert(row, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: scheduled ? "navigation.scheduled" : "navigation.published", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/**
 * Materialize due navigation schedule transitions (points 10·11) — ATOMIC + AUDITED. Called by the
 * cron (/api/cron/cms-schedule). Activates a scheduled menu once publish_at passes, and reverts a menu
 * whose unpublish_at has passed to the exact revision it displaced (predecessor), falling back to the
 * code-config default only when no predecessor exists — the storefront is never left without navigation.
 * Read-time `liveTree` keeps the storefront crisp between ticks; this records the durable state + history.
 */
export async function processCmsSchedule(now = Date.now()): Promise<{ activated: number; deactivated: number }> {
  const db = createAdminClient() as any;
  const { data } = await db.from("navigation_menus").select("*");
  let activated = 0, deactivated = 0;
  for (const row of (data ?? []) as MenuRow[]) {
    const unpub = row.unpublish_at ? Date.parse(row.unpublish_at) : null;
    const pub = row.publish_at ? Date.parse(row.publish_at) : null;
    // Deactivation wins once the window has fully elapsed — revert to the displaced revision (or config).
    if (unpub !== null && now >= unpub && (row.status === "published" || row.status === "scheduled")) {
      const predSnap = row.predecessor_revision_id ? await getRevisionSnapshot(row.predecessor_revision_id) : null;
      const revert = Array.isArray(predSnap) && predSnap.length ? predSnap : null;
      await db.from("navigation_menus").upsert({
        id: row.id, draft: row.draft,
        published: revert, status: revert ? "published" : "draft",
        published_revision_id: revert ? row.predecessor_revision_id : null,
        predecessor_revision_id: null, publish_at: null, unpublish_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      await logEvent({ entityType: "settings", event: "navigation.unpublished", actorType: "system", notes: `${row.id} → ${revert ? `reverted to revision ${row.predecessor_revision_id}` : "code-config default"}` });
      deactivated++;
      continue;
    }
    // Activation — a scheduled menu whose publish_at has arrived (and window not yet elapsed) goes live.
    if (row.status === "scheduled" && pub !== null && now >= pub) {
      const liveRev = await latestRevisionId("navigation", row.id); // the scheduled revision (newest)
      await db.from("navigation_menus").upsert({
        id: row.id, draft: row.draft,
        published: row.draft, status: "published",
        published_revision_id: liveRev ?? row.published_revision_id ?? null,
        predecessor_revision_id: row.predecessor_revision_id ?? null,
        publish_at: null, unpublish_at: row.unpublish_at, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      await logEvent({ entityType: "settings", event: "navigation.activated", actorType: "system", notes: `${row.id} scheduled publish went live` });
      activated++;
    }
  }
  return { activated, deactivated };
}

/** Reset a menu back to the code config (delete the DB override). */
export async function resetMenu(id: MenuId, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("navigation_menus").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "navigation.reset", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

// ── Footer editorial text (tagline / copyright / made-in) — site chrome, admin-editable ─────────────
// Stored in the shared `settings` KV (same pattern as the promo banner), NOT in the publishable footer
// tree — so it never touches the footer data model, validation, revisions or scheduling. Live on save.
export interface FooterMeta { poetic: string; copyright: string; madeIn: string }
export const FOOTER_META_DEFAULTS: FooterMeta = {
  poetic: "Fragrance designed to linger beyond the flame.",
  copyright: "© Samorah Studio",
  madeIn: "Made with care in India.",
};
const FOOTER_META_KEY = "footer.meta";
const cleanText = (s: unknown) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);

/** Read the footer text (falls back to the built-in defaults per field when unset). */
export async function getFooterMeta(): Promise<FooterMeta> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("settings").select("value").eq("key", FOOTER_META_KEY).maybeSingle();
    const v = (data?.value ?? {}) as Partial<FooterMeta>;
    return {
      poetic: typeof v.poetic === "string" ? v.poetic : FOOTER_META_DEFAULTS.poetic,
      copyright: typeof v.copyright === "string" ? v.copyright : FOOTER_META_DEFAULTS.copyright,
      madeIn: typeof v.madeIn === "string" ? v.madeIn : FOOTER_META_DEFAULTS.madeIn,
    };
  } catch { return FOOTER_META_DEFAULTS; }
}

/** Save the footer text (sanitized, ≤200 chars/field; empty is allowed so a line can be hidden). Audited. */
export async function saveFooterMeta(input: Partial<FooterMeta>, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const value: FooterMeta = { poetic: cleanText(input.poetic), copyright: cleanText(input.copyright), madeIn: cleanText(input.madeIn) };
  const { error } = await db.from("settings").upsert(
    { key: FOOTER_META_KEY, value, section: "general", label: "Footer text", updated_by: actorId ?? null, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "footer_meta.updated", actorType: actorId ? "staff" : "system", actorId, notes: FOOTER_META_KEY });
  return { ok: true };
}

// ── Revisions (shared store) ─────────────────────────────────────────────────
export interface MenuRevision extends Revision { actorName: string }

/** Revision history with the actor's name resolved (point 8) — who changed it, when, and the snapshot
 *  (the client computes the diff + previews it before restoring). */
export async function listMenuRevisions(id: MenuId, limit = 30): Promise<MenuRevision[]> {
  const revs = await listCmsRevisions("navigation", id, limit);
  const ids = [...new Set(revs.map((r) => r.actorId).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (ids.length) {
    try {
      const db = createAdminClient() as any;
      const { data } = await db.from("users").select("id, full_name, email").in("id", ids);
      for (const u of data ?? []) names.set(u.id, u.full_name || u.email || "staff");
    } catch { /* names optional */ }
  }
  return revs.map((r) => ({ ...r, actorName: r.actorId ? (names.get(r.actorId) ?? "staff") : "system" }));
}

/** Restore a revision into the DRAFT (non-destructive — review before re-publishing). */
export async function restoreMenuRevision(id: MenuId, revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!Array.isArray(snap)) return { ok: false, reason: "revision not found" };
  const res = await saveDraft(id, snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "navigation.restored", actorType: actorId ? "staff" : "system", actorId, notes: `${id} ← ${revisionId}` });
  return res;
}
