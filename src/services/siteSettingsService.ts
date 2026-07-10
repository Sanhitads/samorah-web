/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Site settings service (Phase 2 / OS Point 11) — reads the site_settings singleton
 * JSONB and MERGES it over config defaults, so the storefront + admin read one
 * typed object with sensible fallbacks. Money-critical config stays in code; this
 * covers brand, support, social, SEO defaults, analytics and the announcement bar.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { COMMERCE } from "@/config/commerce";

export interface SiteSettings {
  brand: { name: string; tagline: string };
  support: { email: string; phone: string; hours: string };
  social: { instagram: string; pinterest: string; spotify: string; facebook: string };
  seo: { titleSuffix: string; defaultDescription: string; ogImageUrl: string };
  analytics: { gaId: string };
  announcement: { text: string; active: boolean; link: string };
}

function defaults(): SiteSettings {
  return {
    brand: { name: COMMERCE.brandName, tagline: "" },
    support: { email: COMMERCE.support.email, phone: (COMMERCE.support as { phone?: string }).phone ?? "", hours: "" },
    social: { instagram: "", pinterest: "", spotify: "", facebook: "" },
    seo: { titleSuffix: ` · ${COMMERCE.brandName}`, defaultDescription: "", ogImageUrl: "" },
    analytics: { gaId: process.env.NEXT_PUBLIC_GA_ID ?? "" },
    announcement: { text: "", active: false, link: "" },
  };
}

/** Deep-merge the stored JSONB over the config defaults (per group). */
export async function getSiteSettings(): Promise<SiteSettings> {
  const d = defaults();
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("site_settings").select("data").eq("id", true).maybeSingle();
    const s = (data?.data ?? {}) as Partial<SiteSettings>;
    return {
      brand: { ...d.brand, ...s.brand },
      support: { ...d.support, ...s.support },
      social: { ...d.social, ...s.social },
      seo: { ...d.seo, ...s.seo },
      analytics: { ...d.analytics, ...s.analytics },
      announcement: { ...d.announcement, ...s.announcement },
    };
  } catch {
    return d;
  }
}

/** Merge a partial patch into the stored JSONB (group-wise) + audit. */
export async function updateSiteSettings(patch: Partial<SiteSettings>, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("site_settings").select("data").eq("id", true).maybeSingle();
    const current = (data?.data ?? {}) as any;
    const merged = { ...current };
    for (const [group, vals] of Object.entries(patch)) merged[group] = { ...(current[group] ?? {}), ...(vals as object) };
    const { error } = await db.from("site_settings").upsert({ id: true, data: merged, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return { ok: false, reason: error.message };
    await logEvent({ entityType: "settings", event: "site_settings.updated", actorType: actorId ? "staff" : "system", actorId, notes: Object.keys(patch).join(", ") });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "failed" };
  }
}
