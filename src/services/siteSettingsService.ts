/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Site settings service (Phase 2 / OS Point 11) — reads the site_settings singleton
 * JSONB and MERGES it over config defaults, so the storefront + admin read one
 * typed object with sensible fallbacks. Money-critical config stays in code; this
 * covers brand, support, social, SEO defaults, analytics and the announcement bar.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { COMMERCE, SHIPPING } from "@/config/commerce";

/** Module toggles (R5). Default false — these gate not-yet-live/optional features. */
export const FEATURE_KEYS = ["reviews", "wishlist", "rewards", "blog", "wholesale", "referral", "subscription", "aiSearch"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface SiteSettings {
  brand: { name: string; tagline: string };
  // Customer-facing contact info — the SINGLE SOURCE the Contact page (and footer) read from.
  // whatsapp / studioAddress are optional; empty = hidden on the page (no placeholders).
  support: { email: string; phone: string; hours: string; whatsapp: string; studioAddress: string };
  social: { instagram: string; pinterest: string; spotify: string; facebook: string };
  seo: { titleSuffix: string; defaultDescription: string; ogImageUrl: string };
  analytics: { gaId: string };
  announcement: { text: string; active: boolean; link: string };
  features: Record<FeatureKey, boolean>;
  maintenance: { enabled: boolean; message: string };
  storeNotice: { text: string; active: boolean };
  // Operating costs (R10) — inputs the Profit report needs but that aren't
  // derivable from orders. Editable here so margin config lives in the CMS, not code.
  costs: { packagingPerOrder: number; paymentFeePercent: number; shippingCostPerOrder: number };
  // Dispatch operations (S2A) — same-day cutoff time + dispatch SLA. Operational config, editable here.
  dispatch: { cutoffTime: string; slaHours: number };
  // Shipping — the free-shipping threshold (₹). Single source of truth: drives the checkout
  // charge, the cart's free-shipping hint, AND the policy/product copy. Default = code constant.
  shipping: { freeThreshold: number };
}

function defaults(): SiteSettings {
  return {
    brand: { name: COMMERCE.brandName, tagline: "" },
    support: { email: COMMERCE.support.email, phone: (COMMERCE.support as { phone?: string }).phone ?? "", hours: "Monday – Saturday, 10:00 AM – 6:00 PM IST", whatsapp: "", studioAddress: "Bengaluru, Karnataka, India" },
    social: { instagram: "", pinterest: "", spotify: "", facebook: "" },
    seo: { titleSuffix: ` · ${COMMERCE.brandName}`, defaultDescription: "", ogImageUrl: "" },
    analytics: { gaId: process.env.NEXT_PUBLIC_GA_ID ?? "" },
    announcement: { text: "", active: false, link: "" },
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>,
    maintenance: { enabled: false, message: "We're making a few improvements. Back very soon." },
    storeNotice: { text: "", active: false },
    costs: { packagingPerOrder: 0, paymentFeePercent: 2, shippingCostPerOrder: 0 },
    dispatch: { cutoffTime: "14:00", slaHours: 24 },
    shipping: { freeThreshold: SHIPPING.freeThreshold },
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
      features: { ...d.features, ...s.features },
      maintenance: { ...d.maintenance, ...s.maintenance },
      storeNotice: { ...d.storeNotice, ...s.storeNotice },
      costs: { ...d.costs, ...s.costs },
      dispatch: { ...d.dispatch, ...s.dispatch },
      shipping: { ...d.shipping, ...s.shipping },
    };
  } catch {
    return d;
  }
}

/**
 * Canonical accessor for the admin-editable free-shipping threshold (₹). The single place
 * that knows it lives at `site_settings.shipping.freeThreshold` (defaulting to the code
 * constant via getSiteSettings). Use this in server contexts that need ONLY the threshold;
 * callers already holding a `SiteSettings` should read `settings.shipping.freeThreshold`
 * directly to avoid a second fetch. Does not touch the money engine — it consumes the number.
 */
export async function getFreeShippingThresholdInr(): Promise<number> {
  return (await getSiteSettings()).shipping.freeThreshold;
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

/** Is an optional module enabled? Reads the feature flags (R5). Safe no-op default (false). */
export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const s = await getSiteSettings();
  return Boolean(s.features[key]);
}
