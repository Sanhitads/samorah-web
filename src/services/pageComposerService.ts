/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Composable Page engine (generalises the Homepage Builder). Generic persistence +
 * publish for ANY composed page (homepage, about, journal…), parameterised by a
 * page key + a small PageConfig (valid section types + default composition). Every
 * page is a publishable resource — draft/published/schedule/revisions — via the
 * point-14 pattern. Homepage and About are both just callers of this one engine.
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { isLive, publishState, type PublishStatus } from "@/lib/cms/publishable";
import { snapshotRevision, listRevisions as listCmsRevisions, getRevisionSnapshot, type Revision } from "@/services/cms/revisions";

export interface ComposedSection { id: string; type: string; enabled: boolean; sortOrder: number; settings: Record<string, unknown> }
export interface PageConfig { validTypes: readonly string[]; defaultSections: () => ComposedSection[] }

export const pageCacheTag = (key: string) => `page:${key}`;

interface Row { page_key: string; draft: any; published: any; status: string; publish_at: string | null; unpublish_at: string | null }

async function readRow(key: string): Promise<Row | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("composed_pages").select("*").eq("page_key", key).maybeSingle();
    return data ?? null;
  } catch { return null; }
}
const order = (a: ComposedSection[]) => [...a].sort((x, y) => x.sortOrder - y.sortOrder);

function liveList(row: Row | null): ComposedSection[] | null {
  if (!row) return null;
  if (row.status === "scheduled") { const t = isLive(row) ? row.draft : row.published; return Array.isArray(t) && t.length ? t : null; }
  if (row.status === "published") return isLive(row) && Array.isArray(row.published) && row.published.length ? row.published : null;
  return null;
}

function sanitize(cfg: PageConfig, data: unknown): ComposedSection[] | null {
  if (!Array.isArray(data)) return null;
  const seen = new Set<string>();
  const out: ComposedSection[] = [];
  data.forEach((s: any, i) => {
    if (!cfg.validTypes.includes(s?.type)) return;
    let id = String(s.id ?? s.type);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({ id, type: s.type, enabled: s.enabled !== false, sortOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : i, settings: (s.settings && typeof s.settings === "object") ? s.settings : {} });
  });
  return out;
}

async function resolveLive(key: string, cfg: PageConfig): Promise<ComposedSection[]> {
  const row = await readRow(key);
  return order((liveList(row) ?? cfg.defaultSections()) as ComposedSection[]);
}

/** Live sections, cached per page key (invalidated by revalidateTag(pageCacheTag(key))). */
export async function getPageSections(key: string, cfg: PageConfig, opts: { preview?: boolean } = {}): Promise<ComposedSection[]> {
  if (opts.preview) {
    const row = await readRow(key);
    return order(((row?.draft?.length ? row.draft : (liveList(row) ?? cfg.defaultSections()))) as ComposedSection[]);
  }
  const cached = unstable_cache(() => resolveLive(key, cfg), ["composed-page", key], { tags: [pageCacheTag(key)], revalidate: 3600 });
  return cached();
}

export type SectionPublishStatus = "published" | "changed" | "new";
export interface PageAdminView { draft: ComposedSection[]; published: ComposedSection[]; publishStatusById: Record<string, SectionPublishStatus>; status: PublishStatus; state: string; publishAt: string | null; unpublishAt: string | null; source: "db" | "config" }

// Per-section fingerprint for the "is this section published / changed / new?" badge (content only).
const contentKey = (s: ComposedSection) => JSON.stringify({ type: s.type, enabled: s.enabled, settings: s.settings ?? {} });

export async function getPageAdmin(key: string, cfg: PageConfig): Promise<PageAdminView> {
  const row = await readRow(key);
  const draft = order((row?.draft ?? cfg.defaultSections()) as ComposedSection[]);
  const published = order((Array.isArray(row?.published) ? row!.published : []) as ComposedSection[]);
  const pubById = new Map(published.map((s) => [s.id, contentKey(s)]));
  const publishStatusById: Record<string, SectionPublishStatus> = {};
  for (const s of draft) {
    const p = pubById.get(s.id);
    publishStatusById[s.id] = p === undefined ? "new" : p === contentKey(s) ? "published" : "changed";
  }
  return {
    draft, published, publishStatusById,
    status: (row?.status ?? "published") as PublishStatus,
    state: row ? publishState(row) : "default",
    publishAt: row?.publish_at ?? null, unpublishAt: row?.unpublish_at ?? null,
    source: row ? "db" : "config",
  };
}

const MGMT_KEYS = ["__state", "__from", "__until"]; // section-management keys kept when healing

/**
 * Pure merge for selective publish (point 13) — SELF-HEALING so a section can never vanish:
 *  • selected            → publish the draft content;
 *  • unselected + live    → keep its current live (published) content unchanged;
 *  • unselected + missing → heal it back with its DEFAULT appearance (content stripped → config
 *    fallback) while keeping its enabled + scheduling state, so it reappears without leaking unpublished
 *    edits. Result follows the draft's order; nothing in the draft is ever dropped from `published`.
 */
export function mergePublishedSections(draft: ComposedSection[], published: ComposedSection[], selectedIds: string[]): ComposedSection[] {
  const selected = new Set(selectedIds);
  const liveById = new Map(published.map((s) => [s.id, s]));
  return draft.map((d, i) => {
    if (selected.has(d.id)) return { ...d, sortOrder: i };                       // publish selected content
    const live = liveById.get(d.id);
    if (live) return { ...live, sortOrder: i };                                  // keep current live content
    const mgmt: Record<string, unknown> = {};                                    // self-heal: strip content, keep state
    for (const k of MGMT_KEYS) if (d.settings?.[k] !== undefined) mgmt[k] = d.settings[k];
    return { id: d.id, type: d.type, enabled: d.enabled, sortOrder: i, settings: mgmt };
  });
}

export async function publishPageSections(key: string, cfg: PageConfig, sectionIds: string[], actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow(key);
  const draft = sanitize(cfg, existing?.draft);
  if (!draft || !draft.length) return { ok: false, reason: "nothing to publish" };
  const selected = new Set(sectionIds ?? []);
  if (!selected.size) return { ok: false, reason: "no sections selected" };
  const published = (Array.isArray(existing?.published) ? existing!.published : []) as ComposedSection[];
  const nextPublished = mergePublishedSections(draft, published, sectionIds);
  if (!nextPublished.some((s) => s.enabled)) return { ok: false, reason: "at least one published section must be enabled" };
  const db = createAdminClient() as any;
  const { error } = await db.from("composed_pages").upsert({
    page_key: key, draft, published: nextPublished, status: "published", updated_at: new Date().toISOString(),
  }, { onConflict: "page_key" });
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision("composed-page", key, nextPublished, actorId, `partial publish (${selected.size} section${selected.size === 1 ? "" : "s"})`);
  await logEvent({ entityType: "settings", event: "page.published_sections", actorType: actorId ? "staff" : "system", actorId, notes: `${key}: ${[...selected].join(", ")}` });
  return { ok: true };
}

export async function savePageDraft(key: string, cfg: PageConfig, data: unknown, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const clean = sanitize(cfg, data);
  if (!clean) return { ok: false, reason: "sections must be a list" };
  const db = createAdminClient() as any;
  const existing = await readRow(key);
  const { error } = await db.from("composed_pages").upsert({ page_key: key, draft: clean, published: existing?.published ?? null, status: "draft", updated_at: new Date().toISOString() }, { onConflict: "page_key" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "page.draft_saved", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

export async function publishPage(key: string, cfg: PageConfig, opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow(key);
  const draft = sanitize(cfg, existing?.draft);
  if (!draft || !draft.length) return { ok: false, reason: "nothing to publish" };
  if (!draft.some((s) => s.enabled)) return { ok: false, reason: "at least one section must be enabled" };
  const scheduled = opts.publishAt && Date.parse(opts.publishAt) > Date.now();
  const db = createAdminClient() as any;
  const { error } = await db.from("composed_pages").upsert({
    page_key: key, draft, published: scheduled ? existing?.published ?? null : draft,
    status: scheduled ? "scheduled" : "published", publish_at: opts.publishAt || null, unpublish_at: opts.unpublishAt || null, updated_at: new Date().toISOString(),
  }, { onConflict: "page_key" });
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision("composed-page", key, draft, actorId, scheduled ? "scheduled publish" : undefined);
  await logEvent({ entityType: "settings", event: scheduled ? "page.scheduled" : "page.published", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

export async function resetPage(key: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("composed_pages").delete().eq("page_key", key);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "page.reset", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

export async function listPageRevisions(key: string, limit = 30): Promise<Revision[]> { return listCmsRevisions("composed-page", key, limit); }

export async function restorePageRevision(key: string, cfg: PageConfig, revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!Array.isArray(snap)) return { ok: false, reason: "revision not found" };
  const res = await savePageDraft(key, cfg, snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "page.restored", actorType: actorId ? "staff" : "system", actorId, notes: `${key} ← ${revisionId}` });
  return res;
}
