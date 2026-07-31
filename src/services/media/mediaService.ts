/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Media service — the layer the admin calls. Owns validation, the `media` DB row,
 * provider orchestration (upload/destroy), and — critically — USAGE. The provider
 * only moves bytes; policy lives here.
 *
 * Usage tracking (R4) is a REVERSE LOOKUP, never a stored counter: "who references
 * this asset?" is answered by scanning the consumers (cms_pages today; homepage,
 * nav, email, products as those slices land). Delete is blocked while in use — so
 * an asset can never vanish from under a live page. This is why every consumer must
 * reference a media id, never copy a URL (see docs/CMS_ARCHITECTURE.md).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { cloudinaryProvider, cloudinaryConfigured } from "./cloudinaryProvider";

export interface MediaRow {
  id: string; kind: string; provider: string; publicId: string | null; url: string;
  width: number | null; height: number | null; bytes: number | null; format: string | null;
  alt: string; title: string; role: string; folder: string; tags: string[];
  focalX: number | null; focalY: number | null; dominantColor: string | null; aspectRatio: string | null;
  credit: string; copyright: string;
  status: string; version: number; createdAt: string;
}

function mapRow(r: any): MediaRow {
  return {
    id: r.id, kind: r.kind, provider: r.provider, publicId: r.public_id ?? null, url: r.url,
    width: r.width ?? null, height: r.height ?? null, bytes: r.bytes ?? null, format: r.format ?? null,
    alt: r.alt ?? "", title: r.title ?? "", role: r.role ?? "support", folder: r.folder ?? "general", tags: Array.isArray(r.tags) ? r.tags : [],
    focalX: r.focal_x ?? null, focalY: r.focal_y ?? null, dominantColor: r.dominant_color ?? null, aspectRatio: r.aspect_ratio ?? null,
    credit: r.credit ?? r.photographer ?? "", copyright: r.copyright ?? "",
    status: r.status, version: r.version ?? 1, createdAt: r.created_at,
  };
}

// Columns added by a later migration — a pre-migration DB errors if we send them, so uploads/updates
// retry without them (mirrors the blur_data_url pattern). Keeps the app working before `db push`.
const SCHEMA_MISS = /credit|copyright|could not find|schema cache|PGRST204|column .* does not exist/i;

export function mediaConfigured(): boolean { return cloudinaryConfigured(); }

/** List assets, optionally filtered by folder / free-text (title/alt) / tag / kind. */
export async function listMedia(opts: { folder?: string; search?: string; tag?: string; kind?: string; limit?: number } = {}): Promise<MediaRow[]> {
  const db = createAdminClient() as any;
  let q = db.from("media").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.folder && opts.folder !== "all") q = q.eq("folder", opts.folder);
  if (opts.kind && opts.kind !== "all") q = q.eq("kind", opts.kind);
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  if (opts.search) {
    const s = opts.search.trim().replace(/[%,]/g, "");
    q = q.or(`title.ilike.%${s}%,alt.ilike.%${s}%`);
  }
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

/** Distinct folders (for the sidebar filter). */
export async function listFolders(): Promise<string[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("media").select("folder");
  return [...new Set((data ?? []).map((r: any) => r.folder as string))].sort() as string[];
}

/** Distinct tags across all assets (for the picker's tag filter). */
export async function listTags(): Promise<string[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("media").select("tags");
  const all = (data ?? []).flatMap((r: any) => (Array.isArray(r.tags) ? r.tags : []));
  return [...new Set(all as string[])].filter(Boolean).sort();
}

/** The narrowest master we'd want on a large-screen luxury PDP; below this we upload but warn. */
export const MIN_RECOMMENDED_WIDTH = 1400;

/** Upload bytes via the storage provider (capped web-master + LQIP + colour), then register the row. */
export async function uploadMedia(bytes: Buffer, meta: { filename?: string; folder?: string; alt?: string; title?: string; kind?: string }, actorId?: string): Promise<{ ok: boolean; id?: string; url?: string; reason?: string; warning?: string; width?: number; height?: number }> {
  if (!cloudinaryConfigured()) return { ok: false, reason: "Storage not configured — paste a URL instead." };
  const kind = meta.kind === "video" ? "video" : "image";
  try {
    const up = await cloudinaryProvider.upload(bytes, { filename: meta.filename, folder: meta.folder, kind });
    const reg = await registerMedia({
      provider: "cloudinary", publicId: up.publicId, url: up.url, kind, width: up.width, height: up.height, bytes: up.bytes, format: up.format,
      dominantColor: up.dominantColor, aspectRatio: up.aspectRatio, blurDataUrl: up.blurDataUrl,
      alt: meta.alt, title: meta.title ?? meta.filename, folder: meta.folder,
    }, actorId);
    // Only images have a min-width recommendation.
    const warning = kind === "image" && up.width && up.width < MIN_RECOMMENDED_WIDTH
      ? `Uploaded, but this image is only ${up.width}px wide — under the recommended ${MIN_RECOMMENDED_WIDTH}px. It may look soft on large screens.`
      : undefined;
    return { ...reg, url: reg.ok ? up.url : undefined, warning, width: up.width, height: up.height };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "upload failed" };
  }
}

export interface RegisterInput {
  provider?: string; publicId?: string | null; url: string; kind?: string;
  width?: number; height?: number; bytes?: number; format?: string;
  alt?: string; title?: string; role?: string; folder?: string; tags?: string[];
  dominantColor?: string; aspectRatio?: string; blurDataUrl?: string; credit?: string; copyright?: string;
}

/** Insert a media row (post-upload, or register-by-URL for an existing asset). */
export async function registerMedia(input: RegisterInput, actorId?: string): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (!input.url?.trim()) return { ok: false, reason: "url required" };
  const db = createAdminClient() as any;
  const row: Record<string, unknown> = {
    kind: input.kind ?? "image", provider: input.provider ?? "external", public_id: input.publicId ?? null, url: input.url.trim(),
    width: input.width ?? null, height: input.height ?? null, bytes: input.bytes ?? null, format: input.format ?? null,
    alt: input.alt ?? null, title: input.title ?? null, role: input.role ?? "support",
    dominant_color: input.dominantColor ?? null, aspect_ratio: input.aspectRatio ?? null,
    folder: (input.folder || "general").trim(), tags: input.tags ?? [], updated_at: new Date().toISOString(),
  };
  if (input.blurDataUrl) row.blur_data_url = input.blurDataUrl;
  if (input.credit) row.credit = input.credit;
  if (input.copyright) row.copyright = input.copyright;
  // blur/credit/copyright columns are added by later migrations — retry without them so a
  // pre-migration upload still works.
  let ins = await db.from("media").insert(row).select("id").maybeSingle();
  if (ins.error && SCHEMA_MISS.test(ins.error.message)) {
    delete row.blur_data_url; delete row.credit; delete row.copyright;
    ins = await db.from("media").insert(row).select("id").maybeSingle();
  }
  const { data, error } = ins;
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "media.uploaded", entityId: data?.id, actorType: actorId ? "staff" : "system", actorId, notes: String(row.title ?? row.url ?? "") });
  return { ok: true, id: data?.id };
}

export async function updateMedia(id: string, patch: { alt?: string; title?: string; role?: string; folder?: string; tags?: string[]; focalX?: number | null; focalY?: number | null; credit?: string; copyright?: string }, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const row: any = { updated_at: new Date().toISOString() };
  if (patch.alt !== undefined) row.alt = patch.alt || null;
  if (patch.title !== undefined) row.title = patch.title || null;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.folder !== undefined) row.folder = (patch.folder || "general").trim();
  if (patch.tags !== undefined) row.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  if (patch.focalX !== undefined) row.focal_x = patch.focalX;
  if (patch.focalY !== undefined) row.focal_y = patch.focalY;
  if (patch.credit !== undefined) row.credit = patch.credit || null;
  if (patch.copyright !== undefined) row.copyright = patch.copyright || null;
  let upd = await db.from("media").update(row).eq("id", id);
  if (upd.error && SCHEMA_MISS.test(upd.error.message)) {
    delete row.credit; delete row.copyright;
    upd = await db.from("media").update(row).eq("id", id);
  }
  if (upd.error) return { ok: false, reason: upd.error.message };
  await logEvent({ entityType: "settings", event: "media.updated", entityId: id, actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

// ── Usage tracking (R4) — reverse lookup across consumers ────────────────────
export interface MediaUsage { usedBy: { type: string; id: string; context?: string }[] }

/**
 * Who references this asset? Scans each CMS consumer for the media id. Today that's
 * cms_pages (sections + seo); as Homepage/Nav/Email/product-gallery slices land,
 * each adds one branch here — usage stays a single authoritative reverse lookup.
 */
export async function getMediaUsage(id: string): Promise<MediaUsage> {
  const db = createAdminClient() as any;
  const usedBy: MediaUsage["usedBy"] = [];
  // Pages — sections + seo reference media ids.
  try {
    const { data: pages } = await db.from("cms_pages").select("slug,title,sections,seo");
    for (const p of pages ?? []) {
      const blob = JSON.stringify(p.sections ?? "") + JSON.stringify(p.seo ?? "");
      if (blob.includes(id)) usedBy.push({ type: "page", id: p.slug, context: p.title });
    }
  } catch { /* cms_pages optional */ }
  // Navigation — mega-menu campaign imagery references media ids.
  try {
    const { data: menus } = await db.from("navigation_menus").select("id,draft,published");
    for (const m of menus ?? []) {
      if ((JSON.stringify(m.published ?? "") + JSON.stringify(m.draft ?? "")).includes(id)) usedBy.push({ type: "navigation", id: m.id, context: `${m.id} menu` });
    }
  } catch { /* navigation optional */ }
  // Composed pages (homepage, about…) — section settings reference media ids (point 10).
  try {
    const { data: pages } = await db.from("composed_pages").select("page_key,draft,published");
    for (const p of pages ?? []) {
      if ((JSON.stringify(p.published ?? "") + JSON.stringify(p.draft ?? "")).includes(id)) usedBy.push({ type: "page", id: p.page_key, context: `${p.page_key} section` });
    }
  } catch { /* composed pages optional */ }
  return { usedBy };
}

/** Delete an asset — BLOCKED while any consumer references it. Removes bytes too. */
export async function deleteMedia(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string; usage?: MediaUsage }> {
  const usage = await getMediaUsage(id);
  if (usage.usedBy.length) return { ok: false, reason: `In use by ${usage.usedBy.length} item(s)`, usage };
  const db = createAdminClient() as any;
  const { data: row } = await db.from("media").select("provider,public_id,kind").eq("id", id).maybeSingle();
  const { error } = await db.from("media").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  if (row?.provider === "cloudinary" && row.public_id) { try { await cloudinaryProvider.destroy(row.public_id, row.kind); } catch { /* best-effort */ } }
  await logEvent({ entityType: "settings", event: "media.deleted", entityId: id, actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
