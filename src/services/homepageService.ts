/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Homepage Builder service (CMS slice 4, review points 9·10). The homepage is an
 * ordered list of TYPED SECTIONS — each a first-class { id, type, enabled,
 * sortOrder, settings } descriptor — not a monolithic blob. It's a publishable
 * resource: draft vs published section lists, a publish window, and revisions via
 * the shared point-14 pattern. Storefront reads the live list (config fallback).
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { isLive, publishState, type PublishStatus } from "@/lib/cms/publishable";
import { snapshotRevision, listRevisions as listCmsRevisions, getRevisionSnapshot, type Revision } from "@/services/cms/revisions";

/** The section types the storefront knows how to render (the registry lives in the page). */
export const SECTION_TYPES = ["hero", "chapters", "brand-story", "atmosphere", "invitations", "words", "editorial-world", "letters"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_META: Record<SectionType, { label: string; note: string }> = {
  hero: { label: "Hero", note: "Campaign-driven opening" },
  chapters: { label: "Signature Chapters", note: "Editorial chapter rail" },
  "brand-story": { label: "Brand Story", note: "The maker's quiet" },
  atmosphere: { label: "The Atmosphere", note: "Inhabit one fragrance-world" },
  invitations: { label: "Living with Fragrance", note: "Two ways of living" },
  words: { label: "Words", note: "One literary sentence" },
  "editorial-world": { label: "Editorial World", note: "The final magazine spread" },
  letters: { label: "The Letters", note: "Quiet editorial close" },
};

export interface HomeSection { id: string; type: SectionType; enabled: boolean; sortOrder: number; settings: Record<string, unknown> }

/** Default composition (the current hand-built homepage order) — the config fallback. */
export function defaultSections(): HomeSection[] {
  return SECTION_TYPES.map((type, i) => ({ id: type, type, enabled: true, sortOrder: i, settings: {} }));
}

const NAV_TAG = "homepage";
export const HOMEPAGE_CACHE_TAG = NAV_TAG;

interface HomeRow { draft: any; published: any; status: string; publish_at: string | null; unpublish_at: string | null }

async function readRow(): Promise<HomeRow | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("homepage").select("*").eq("id", true).maybeSingle();
    return data ?? null;
  } catch { return null; }
}

function order(sections: HomeSection[]): HomeSection[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
}

function liveList(row: HomeRow | null): HomeSection[] | null {
  if (!row) return null;
  if (row.status === "scheduled") { const t = isLive(row) ? row.draft : row.published; return Array.isArray(t) && t.length ? t : null; }
  if (row.status === "published") return isLive(row) && Array.isArray(row.published) && row.published.length ? row.published : null;
  return null;
}

async function resolveLive(): Promise<HomeSection[]> {
  const row = await readRow();
  return order((liveList(row) ?? defaultSections()) as HomeSection[]);
}
/** Live sections cached under the `homepage` tag; publish/reset revalidate it. */
const getLiveHomepage = unstable_cache(resolveLive, ["homepage-live"], { tags: [HOMEPAGE_CACHE_TAG], revalidate: 3600 });

/** Public read — live section list, or draft when `preview` (staff-gated). */
export async function getHomepageSections(opts: { preview?: boolean } = {}): Promise<HomeSection[]> {
  if (!opts.preview) return getLiveHomepage();
  const row = await readRow();
  return order(((row?.draft?.length ? row.draft : (liveList(row) ?? defaultSections()))) as HomeSection[]);
}

// ── Admin ────────────────────────────────────────────────────────────────────
export interface HomepageAdminView { draft: HomeSection[]; status: PublishStatus; state: string; publishAt: string | null; unpublishAt: string | null; source: "db" | "config" }

export async function getHomepageAdmin(): Promise<HomepageAdminView> {
  const row = await readRow();
  return {
    draft: order((row?.draft ?? defaultSections()) as HomeSection[]),
    status: (row?.status ?? "published") as PublishStatus,
    state: row ? publishState(row) : "default",
    publishAt: row?.publish_at ?? null, unpublishAt: row?.unpublish_at ?? null,
    source: row ? "db" : "config",
  };
}

function sanitizeSections(data: unknown): HomeSection[] | null {
  if (!Array.isArray(data)) return null;
  const seen = new Set<string>();
  const out: HomeSection[] = [];
  data.forEach((s: any, i) => {
    if (!SECTION_TYPES.includes(s?.type)) return; // drop unknown types
    let id = String(s.id ?? s.type);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({ id, type: s.type, enabled: s.enabled !== false, sortOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : i, settings: (s.settings && typeof s.settings === "object") ? s.settings : {} });
  });
  return out;
}

export async function saveHomepageDraft(data: unknown, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const clean = sanitizeSections(data);
  if (!clean) return { ok: false, reason: "sections must be a list" };
  const db = createAdminClient() as any;
  const existing = await readRow();
  const { error } = await db.from("homepage").upsert({ id: true, draft: clean, published: existing?.published ?? null, status: "draft", updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "homepage.draft_saved", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function publishHomepage(opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow();
  const draft = sanitizeSections(existing?.draft);
  if (!draft || !draft.length) return { ok: false, reason: "nothing to publish" };
  if (!draft.some((s) => s.enabled)) return { ok: false, reason: "at least one section must be enabled" };
  const scheduled = opts.publishAt && Date.parse(opts.publishAt) > Date.now();
  const db = createAdminClient() as any;
  const { error } = await db.from("homepage").upsert({
    id: true, draft, published: scheduled ? existing?.published ?? null : draft,
    status: scheduled ? "scheduled" : "published", publish_at: opts.publishAt || null, unpublish_at: opts.unpublishAt || null, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision("homepage", "homepage", draft, actorId, scheduled ? "scheduled publish" : undefined);
  await logEvent({ entityType: "settings", event: scheduled ? "homepage.scheduled" : "homepage.published", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function resetHomepage(actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("homepage").delete().eq("id", true);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "homepage.reset", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function listHomepageRevisions(limit = 30): Promise<Revision[]> { return listCmsRevisions("homepage", "homepage", limit); }

export async function restoreHomepageRevision(revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!Array.isArray(snap)) return { ok: false, reason: "revision not found" };
  const res = await saveHomepageDraft(snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "homepage.restored", actorType: actorId ? "staff" : "system", actorId, notes: revisionId });
  return res;
}
