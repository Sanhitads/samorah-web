/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SEO overrides + Redirects admin service (CMS slice 6). Redirects power DB-driven
 * 301/302s (applied in middleware); SEO overrides layer per-route meta/canonical/OG/
 * robots over the global defaults (site_settings.seo), read by generateMetadata.
 */
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { getSiteSettings } from "@/services/siteSettingsService";

// ── Redirects ────────────────────────────────────────────────────────────────
export interface RedirectRow { id: string; fromPath: string; toPath: string; code: number; enabled: boolean; hits: number }

export async function listRedirects(): Promise<RedirectRow[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("redirects").select("*").order("from_path");
  return (data ?? []).map((r: any) => ({ id: r.id, fromPath: r.from_path, toPath: r.to_path, code: r.code, enabled: r.enabled, hits: r.hits ?? 0 }));
}

const cleanPath = (p: string) => { p = String(p ?? "").trim(); if (p && !p.startsWith("/") && !p.startsWith("http")) p = `/${p}`; return p; };

export async function upsertRedirect(input: { id?: string; fromPath: string; toPath: string; code?: number; enabled?: boolean }, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const from = cleanPath(input.fromPath), to = cleanPath(input.toPath);
  if (!from || !to) return { ok: false, reason: "from and to are required" };
  if (from === to) return { ok: false, reason: "from and to cannot be identical (redirect loop)" };
  const db = createAdminClient() as any;
  const row: any = { from_path: from, to_path: to, code: input.code === 302 ? 302 : 301, enabled: input.enabled !== false };
  if (input.id) row.id = input.id;
  const { error } = await db.from("redirects").upsert(row, { onConflict: "from_path" });
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "A redirect from that path already exists" : error.message };
  await logEvent({ entityType: "settings", event: "redirect.saved", actorType: actorId ? "staff" : "system", actorId, notes: `${from} → ${to}` });
  return { ok: true };
}

export async function deleteRedirect(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("redirects").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "redirect.deleted", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

// ── SEO overrides ──────────────────────────────────────────────────────────
export interface SeoOverrideRow { path: string; title: string; description: string; ogImage: string; robots: string; canonical: string; sitemapPriority: string; changeFreq: string; structuredData: string }

const jsonToText = (v: unknown): string => { if (v == null) return ""; try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return ""; } };
// structured_data is added by a later migration — reads/writes tolerate its absence.
const SEO_SCHEMA_MISS = /structured_data|could not find|schema cache|PGRST204|column .* does not exist/i;

export async function listSeoOverrides(): Promise<SeoOverrideRow[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("seo_overrides").select("*").order("path");
  return (data ?? []).map((r: any) => ({ path: r.path, title: r.title ?? "", description: r.description ?? "", ogImage: r.og_image ?? "", robots: r.robots ?? "", canonical: r.canonical ?? "", sitemapPriority: r.sitemap_priority != null ? String(r.sitemap_priority) : "", changeFreq: r.change_freq ?? "", structuredData: jsonToText(r.structured_data) }));
}

export async function upsertSeoOverride(input: { path: string; title?: string; description?: string; ogImage?: string; robots?: string; canonical?: string; sitemapPriority?: string; changeFreq?: string; structuredData?: string }, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const path = cleanPath(input.path);
  if (!path) return { ok: false, reason: "path required" };
  // Validate custom JSON-LD up front so we never store invalid JSON.
  let structured: unknown = undefined;
  if (input.structuredData !== undefined) {
    const t = input.structuredData.trim();
    if (!t) structured = null;
    else { try { structured = JSON.parse(t); } catch { return { ok: false, reason: "Structured data must be valid JSON." }; } }
  }
  const db = createAdminClient() as any;
  const prio = input.sitemapPriority && !Number.isNaN(Number(input.sitemapPriority)) ? Number(input.sitemapPriority) : null;
  const row: Record<string, unknown> = { path, title: input.title || null, description: input.description || null, og_image: input.ogImage || null, robots: input.robots || null, canonical: input.canonical || null, sitemap_priority: prio, change_freq: input.changeFreq || null, updated_at: new Date().toISOString() };
  if (structured !== undefined) row.structured_data = structured;
  let up = await db.from("seo_overrides").upsert(row, { onConflict: "path" });
  if (up.error && SEO_SCHEMA_MISS.test(up.error.message)) { delete row.structured_data; up = await db.from("seo_overrides").upsert(row, { onConflict: "path" }); }
  if (up.error) return { ok: false, reason: up.error.message };
  await logEvent({ entityType: "settings", event: "seo.saved", actorType: actorId ? "staff" : "system", actorId, notes: path });
  return { ok: true };
}

/** The custom JSON-LD object stored for a route (for `<script type="application/ld+json">`), or null. */
export async function getRouteStructuredData(path: string): Promise<unknown | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("seo_overrides").select("structured_data").eq("path", cleanPath(path)).maybeSingle();
    return data?.structured_data ?? null;
  } catch { return null; }
}

export async function deleteSeoOverride(path: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("seo_overrides").delete().eq("path", path);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "seo.deleted", actorType: actorId ? "staff" : "system", actorId, notes: path });
  return { ok: true };
}

/** Resolved SEO for a route — per-path override layered over global defaults. */
export interface RouteSeo { title?: string; description?: string; ogImage?: string; robots?: string; canonical?: string; sitemapPriority?: number; changeFreq?: string }
export async function getRouteSeo(path: string): Promise<RouteSeo> {
  const settings = await getSiteSettings();
  const base: RouteSeo = { description: settings.seo.defaultDescription || undefined, ogImage: settings.seo.ogImageUrl || undefined };
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("seo_overrides").select("*").eq("path", cleanPath(path)).maybeSingle();
    if (data) return { title: data.title || base.title, description: data.description || base.description, ogImage: data.og_image || base.ogImage, robots: data.robots || undefined, canonical: data.canonical || undefined, sitemapPriority: data.sitemap_priority ?? undefined, changeFreq: data.change_freq || undefined };
  } catch { /* fall back to defaults */ }
  return base;
}

/** Overlay a route's DB SEO override onto its natural metadata (override wins). One
 *  line per route: `return withRouteSeo("/shop/"+slug, base)` in generateMetadata. */
export async function withRouteSeo(path: string, base: Metadata = {}): Promise<Metadata> {
  const s = await getRouteSeo(path);
  return {
    ...base,
    title: s.title || base.title,
    description: s.description || (base.description as string | undefined),
    alternates: s.canonical ? { ...(base.alternates ?? {}), canonical: s.canonical } : base.alternates,
    openGraph: s.ogImage ? { ...(base.openGraph ?? {}), images: [s.ogImage] } : base.openGraph,
    robots: s.robots || base.robots,
  };
}
