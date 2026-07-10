/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SEO overrides + Redirects admin service (CMS slice 6). Redirects power DB-driven
 * 301/302s (applied in middleware); SEO overrides layer per-route meta/canonical/OG/
 * robots over the global defaults (site_settings.seo), read by generateMetadata.
 */
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
export interface SeoOverrideRow { path: string; title: string; description: string; ogImage: string; robots: string }

export async function listSeoOverrides(): Promise<SeoOverrideRow[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("seo_overrides").select("*").order("path");
  return (data ?? []).map((r: any) => ({ path: r.path, title: r.title ?? "", description: r.description ?? "", ogImage: r.og_image ?? "", robots: r.robots ?? "" }));
}

export async function upsertSeoOverride(input: { path: string; title?: string; description?: string; ogImage?: string; robots?: string }, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const path = cleanPath(input.path);
  if (!path) return { ok: false, reason: "path required" };
  const db = createAdminClient() as any;
  const { error } = await db.from("seo_overrides").upsert({ path, title: input.title || null, description: input.description || null, og_image: input.ogImage || null, robots: input.robots || null, updated_at: new Date().toISOString() }, { onConflict: "path" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "seo.saved", actorType: actorId ? "staff" : "system", actorId, notes: path });
  return { ok: true };
}

export async function deleteSeoOverride(path: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("seo_overrides").delete().eq("path", path);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "seo.deleted", actorType: actorId ? "staff" : "system", actorId, notes: path });
  return { ok: true };
}

/** Resolved SEO for a route — per-path override layered over global defaults. */
export interface RouteSeo { title?: string; description?: string; ogImage?: string; robots?: string }
export async function getRouteSeo(path: string): Promise<RouteSeo> {
  const settings = await getSiteSettings();
  const base: RouteSeo = { description: settings.seo.defaultDescription || undefined, ogImage: settings.seo.ogImageUrl || undefined };
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("seo_overrides").select("*").eq("path", cleanPath(path)).maybeSingle();
    if (data) return { title: data.title || base.title, description: data.description || base.description, ogImage: data.og_image || base.ogImage, robots: data.robots || undefined };
  } catch { /* fall back to defaults */ }
  return base;
}
