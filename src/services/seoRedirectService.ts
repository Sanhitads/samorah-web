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
import { SITE_CONFIG } from "@/config/site";
import { analyzeRedirectGraph } from "@/lib/seo/redirectGraph";
import { normalizePath } from "@/lib/redirects";
import { validatePathStructure, validateCanonical, isNoindex, isMajorRoute } from "@/lib/seo/seoValidation";
import { loadDestinationIndex, verdictFor, classifyHref } from "@/lib/cms/navValidation";
import { classifyRedirectHealth, type RedirectHealth } from "@/lib/seo/redirectHealth";

// ── Redirects ────────────────────────────────────────────────────────────────
export interface RedirectRow { id: string; fromPath: string; toPath: string; code: number; enabled: boolean; hits: number; createdAt: string }

export async function listRedirects(): Promise<RedirectRow[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("redirects").select("*").order("from_path");
  return (data ?? []).map((r: any) => ({ id: r.id, fromPath: r.from_path, toPath: r.to_path, code: r.code, enabled: r.enabled, hits: r.hits ?? 0, createdAt: r.created_at ?? "" }));
}

/** Redirects with deterministic health (point 20) — one lifecycle-index load, then a pure classify per
 *  row. No traffic signal (instrumentation deferred). */
export interface RedirectRowH extends RedirectRow { health: RedirectHealth; healthDetail?: string }
export async function listRedirectsWithHealth(): Promise<RedirectRowH[]> {
  const rows = await listRedirects();
  const idx = await loadDestinationIndex();
  const enabledSources = new Map(rows.filter((r) => r.enabled).map((r) => [normalizePath(r.fromPath), normalizePath(r.toPath)]));
  return rows.map((r) => {
    let broken = false;
    if (r.enabled && r.toPath.startsWith("/")) { const v = verdictFor({ href: r.toPath }, idx); broken = v.kind === "missing" || v.kind === "archived"; }
    const h = classifyRedirectHealth(r, enabledSources, broken);
    return { ...r, health: h.health, healthDetail: h.detail };
  });
}

const cleanPath = (p: string) => { p = String(p ?? "").trim(); if (p && !p.startsWith("/") && !p.startsWith("http")) p = `/${p}`; return p; };

/** Result of validating a redirect or SEO override. `errors` block; `warnings` are advisory; `confirmations`
 *  are strong warnings the operator must explicitly acknowledge (passed as `confirmed`) to proceed. */
export interface SeoAnalysis { errors: string[]; warnings: string[]; confirmations: string[]; finalDestination?: string }
const emptyAnalysis = (): SeoAnalysis => ({ errors: [], warnings: [], confirmations: [] });

/** Validate a redirect against the COMPLETE active graph + the canonical destination lifecycle (point 1·2·3). */
export async function analyzeRedirect(input: { id?: string; fromPath: string; toPath: string }, existing?: RedirectRow[]): Promise<SeoAnalysis> {
  const a = emptyAnalysis();
  const from = cleanPath(input.fromPath), to = cleanPath(input.toPath);
  if (!from || !to) { a.errors.push("Both a 'from' and 'to' path are required."); return a; }
  const fs = validatePathStructure(from, { role: "source" }); if (fs.error) a.errors.push(`From: ${fs.error}`); if (fs.warn) a.warnings.push(fs.warn);
  const ts = validatePathStructure(to, { allowExternal: true, role: "destination" }); if (ts.error) a.errors.push(`To: ${ts.error}`);
  if (a.errors.length) return a;
  // Graph: loops (block) + chains (warn + flatten target).
  const rows = existing ?? await listRedirects();
  const g = analyzeRedirectGraph({ id: input.id, from, to }, rows.map((r) => ({ id: r.id, from: r.fromPath, to: r.toPath, enabled: r.enabled })));
  a.errors.push(...g.errors); a.warnings.push(...g.warnings); a.finalDestination = g.finalDestination;
  // Canonical lifecycle (reuses Navigation's resolver — no second lifecycle engine).
  const idx = await loadDestinationIndex();
  if (to.startsWith("/")) {
    const v = verdictFor({ href: to }, idx);
    if (v.kind === "missing") a.errors.push(`Destination ${to} doesn't resolve to a live page (broken redirect).`);
    else if (v.kind === "archived") a.errors.push(`Destination ${to} is unavailable — ${v.detail}.`);
    else if (v.kind === "unknown") a.warnings.push(`Destination ${to} is a custom/unknown route — confirm it resolves.`);
  }
  // Source is a live route → redirect wins before render, hiding it. Strong warning + explicit confirm.
  if (from.startsWith("/") && verdictFor({ href: from }, idx).kind === "ok") {
    a.confirmations.push(`${from} is currently a live page. A redirect is applied BEFORE the page renders, so publishing this makes that page inaccessible.`);
  }
  return a;
}

/** Fetch the current redirect row for before/after audit (by id, else by from_path). */
async function redirectBefore(db: any, input: { id?: string; fromPath: string }): Promise<any | null> {
  try {
    const q = db.from("redirects").select("*");
    const { data } = input.id ? await q.eq("id", input.id).maybeSingle() : await q.eq("from_path", cleanPath(input.fromPath)).maybeSingle();
    return data ?? null;
  } catch { return null; }
}

export async function upsertRedirect(input: { id?: string; fromPath: string; toPath: string; code?: number; enabled?: boolean }, opts: { actorId?: string; confirmed?: boolean } = {}): Promise<{ ok: boolean; reason?: string; analysis?: SeoAnalysis }> {
  const from = cleanPath(input.fromPath), to = cleanPath(input.toPath);
  const analysis = await analyzeRedirect(input);
  if (analysis.errors.length) return { ok: false, reason: analysis.errors[0], analysis };
  if (analysis.confirmations.length && !opts.confirmed) return { ok: false, reason: analysis.confirmations[0], analysis };
  const db = createAdminClient() as any;
  const before = await redirectBefore(db, input);
  const row: any = { from_path: from, to_path: to, code: input.code === 302 ? 302 : 301, enabled: input.enabled !== false };
  // Preserve identity: editing UPDATES the existing row by id (so id/hits and the source path can change
  // without orphaning a row); a new redirect INSERTS. analyzeRedirect already re-validated the proposed
  // graph (loops/duplicate/lifecycle) with this row's id excluded, so a source edit can't break the graph.
  const { error } = input.id
    ? await db.from("redirects").update(row).eq("id", input.id)
    : await db.from("redirects").insert(row);
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "A redirect from that path already exists" : error.message };
  // Enriched audit: distinguish create / enable / disable / update, with before→after.
  const event = !before ? "redirect.created"
    : before.enabled !== row.enabled ? (row.enabled ? "redirect.enabled" : "redirect.disabled")
    : "redirect.updated";
  await logEvent({ entityType: "settings", event, actorType: opts.actorId ? "staff" : "system", actorId: opts.actorId, notes: `${from} → ${to} (${row.code})`, metadata: { before: before && { from: before.from_path, to: before.to_path, code: before.code, enabled: before.enabled }, after: { from, to, code: row.code, enabled: row.enabled } } });
  return { ok: true, analysis };
}

export async function deleteRedirect(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const before = await redirectBefore(db, { id, fromPath: "" });
  const { error } = await db.from("redirects").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "redirect.deleted", actorType: actorId ? "staff" : "system", actorId, notes: before ? `${before.from_path} → ${before.to_path}` : id, metadata: { before: before && { from: before.from_path, to: before.to_path, code: before.code, enabled: before.enabled } } });
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

/** Validate an SEO override (point 6·7). Canonical/robots safety + confirmations (cross-domain, noindex). */
export async function analyzeSeoOverride(input: { path: string; title?: string; description?: string; canonical?: string; robots?: string; ogImage?: string }): Promise<SeoAnalysis> {
  const a = emptyAnalysis();
  const path = cleanPath(input.path);
  if (!path) { a.errors.push("A path is required."); return a; }
  const ps = validatePathStructure(path); if (ps.error) a.errors.push(`Path: ${ps.error}`);
  if (input.canonical) {
    const c = validateCanonical(input.canonical, SITE_CONFIG.primaryDomain);
    if (c.error) a.errors.push(`Canonical: ${c.error}`);
    else if (c.crossDomain) a.confirmations.push(`Canonical points to another domain — search engines will treat that domain as the owner of this page's content.`);
    else if (c.warn) a.warnings.push(c.warn);
    if (input.canonical.startsWith("/")) {
      const target = normalizePath(cleanPath(input.canonical));
      const rows = await listRedirects();
      if (rows.some((r) => r.enabled && normalizePath(r.fromPath) === target)) a.warnings.push(`Canonical ${input.canonical} is itself redirected — point the canonical at the final URL instead.`);
    }
  }
  if (isNoindex(input.robots)) {
    if (isMajorRoute(path)) a.confirmations.push(`Marking ${path} "noindex" asks search engines to remove this major page from search results.`);
    else a.warnings.push(`${path} is set to "noindex" — it won't appear in search results.`);
    if (input.canonical) a.warnings.push(`This page is "noindex" but also sets a canonical — those signals can conflict.`);
  }
  // Route existence (Invariant 4) — reuse the canonical Navigation classifier + lifecycle index (no
  // second resolver). An unresolved internal route is a likely typo → CONFIRM (don't silently accept
  // /abuot); a not-live entity → warn. Confirmation (not a hard block) preserves legitimate custom/
  // future-route capability. Skipped only if the index can't load at all.
  const TYPO = (p: string) => `${p} doesn't match a known storefront route — confirm it's intentional (a custom or future route), or fix a likely typo.`;
  try {
    const idx = await loadDestinationIndex();
    const c = classifyHref(path);
    if (c.kind === "page") {
      const status = idx.pages.get(c.slug);
      if (status === undefined) a.confirmations.push(TYPO(path));
      else if (status !== "published") a.warnings.push(`${path} points to a page that isn't currently live (${status}).`);
    } else if (c.kind === "entity") {
      if (c.type === "product") { const st = idx.products.get(c.slug); if (st === undefined) a.confirmations.push(TYPO(path)); else if (st !== "active") a.warnings.push(`${path} points to a product that isn't live (${st}).`); }
      else if (c.type === "chapter" && idx.chapters.size && !idx.chapters.has(c.slug)) a.confirmations.push(TYPO(path));
      else if (c.type === "collection" && idx.collections.size && !idx.collections.has(c.slug)) a.confirmations.push(TYPO(path));
    } else if (c.kind === "unknown") {
      a.warnings.push(`${path} is a deep custom route we can't verify — double-check it resolves.`);
    }
    // empty / static / external → no existence concern
  } catch { /* index unavailable → skip existence check (never fabricate) */ }
  return a;
}

export async function upsertSeoOverride(input: { path: string; title?: string; description?: string; ogImage?: string; robots?: string; canonical?: string; sitemapPriority?: string; changeFreq?: string; structuredData?: string }, opts: { actorId?: string; confirmed?: boolean } = {}): Promise<{ ok: boolean; reason?: string; analysis?: SeoAnalysis }> {
  const path = cleanPath(input.path);
  if (!path) return { ok: false, reason: "path required" };
  const analysis = await analyzeSeoOverride(input);
  if (analysis.errors.length) return { ok: false, reason: analysis.errors[0], analysis };
  if (analysis.confirmations.length && !opts.confirmed) return { ok: false, reason: analysis.confirmations[0], analysis };
  // Validate custom JSON-LD up front so we never store invalid JSON.
  let structured: unknown = undefined;
  if (input.structuredData !== undefined) {
    const t = input.structuredData.trim();
    if (!t) structured = null;
    else { try { structured = JSON.parse(t); } catch { return { ok: false, reason: "Structured data must be valid JSON." }; } }
  }
  const db = createAdminClient() as any;
  const before = await db.from("seo_overrides").select("*").eq("path", path).maybeSingle().then((r: any) => r.data).catch(() => null);
  const prio = input.sitemapPriority && !Number.isNaN(Number(input.sitemapPriority)) ? Number(input.sitemapPriority) : null;
  const row: Record<string, unknown> = { path, title: input.title || null, description: input.description || null, og_image: input.ogImage || null, robots: input.robots || null, canonical: input.canonical || null, sitemap_priority: prio, change_freq: input.changeFreq || null, updated_at: new Date().toISOString() };
  if (structured !== undefined) row.structured_data = structured;
  let up = await db.from("seo_overrides").upsert(row, { onConflict: "path" });
  if (up.error && SEO_SCHEMA_MISS.test(up.error.message)) { delete row.structured_data; up = await db.from("seo_overrides").upsert(row, { onConflict: "path" }); }
  if (up.error) return { ok: false, reason: up.error.message };
  await logEvent({ entityType: "settings", event: before ? "seo.updated" : "seo.created", actorType: opts.actorId ? "staff" : "system", actorId: opts.actorId, notes: path, metadata: { before: before && { title: before.title, description: before.description, robots: before.robots, canonical: before.canonical, og_image: before.og_image }, after: { title: row.title, description: row.description, robots: row.robots, canonical: row.canonical, og_image: row.og_image } } });
  return { ok: true, analysis };
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
  const before = await db.from("seo_overrides").select("*").eq("path", path).maybeSingle().then((r: any) => r.data).catch(() => null);
  const { error } = await db.from("seo_overrides").delete().eq("path", path);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "seo.deleted", actorType: actorId ? "staff" : "system", actorId, notes: path, metadata: { before: before && { title: before.title, description: before.description, robots: before.robots, canonical: before.canonical, og_image: before.og_image } } });
  return { ok: true };
}

/** Field provenance for the "Resolved SEO & inheritance" panel (point 9·10). We show a concrete value
 *  ONLY when the canonical infrastructure can resolve it (override row or site default); a value the
 *  route itself supplies later via generateMetadata is labelled "inherited from page" — never fabricated. */
export type SeoProvenance = "overridden" | "site-default" | "inherited-page" | "not-overridden";
export interface EffectiveField { value: string | null; provenance: SeoProvenance }
export interface EffectiveSeo { title: EffectiveField; description: EffectiveField; canonical: EffectiveField; robots: EffectiveField; ogImage: EffectiveField }

/** Resolve a route's effective SEO using the SAME resolver the storefront uses (getRouteSeo) + the raw
 *  override row for provenance. No second metadata resolver, no generateMetadata re-execution. */
export async function getEffectiveSeo(path: string): Promise<EffectiveSeo> {
  const resolved = await getRouteSeo(path); // canonical value source
  let row: any = null;
  try { const db = createAdminClient() as any; row = (await db.from("seo_overrides").select("*").eq("path", cleanPath(path)).maybeSingle()).data; } catch { /* provenance falls back to inherited */ }
  const has = (v: unknown) => v != null && String(v).trim() !== "";
  return {
    title: has(row?.title) ? { value: resolved.title ?? row.title, provenance: "overridden" } : { value: null, provenance: "inherited-page" },
    description: has(row?.description) ? { value: resolved.description ?? null, provenance: "overridden" } : has(resolved.description) ? { value: resolved.description!, provenance: "site-default" } : { value: null, provenance: "inherited-page" },
    ogImage: has(row?.og_image) ? { value: resolved.ogImage ?? null, provenance: "overridden" } : has(resolved.ogImage) ? { value: resolved.ogImage!, provenance: "site-default" } : { value: null, provenance: "inherited-page" },
    robots: has(row?.robots) ? { value: resolved.robots ?? row.robots, provenance: "overridden" } : { value: "index,follow", provenance: "not-overridden" },
    canonical: has(row?.canonical) ? { value: resolved.canonical ?? row.canonical, provenance: "overridden" } : { value: null, provenance: "inherited-page" },
  };
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
