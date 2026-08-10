/**
 * Central cache-duration registry for Analytics and every external/cached source (GA4, Clarity,
 * Razorpay, and future services). One place to reason about freshness vs. load. Each default can be
 * overridden per-environment via `ANALYTICS_CACHE_<KEY>_MS` (e.g. ANALYTICS_CACHE_GA4_MS=60000) without
 * a code change. Durations are milliseconds; use `seconds()` where an API wants seconds (unstable_cache).
 */
type CacheKey = "kpi" | "dailySeries" | "ga4" | "clarity" | "razorpay" | "reports";

const DEFAULTS_MS: Record<CacheKey, number> = {
  kpi: 60_000, // first-party KPI snapshot — short TTL, near-real-time
  dailySeries: 300_000, // daily trend series (MV-backed) — 5 min
  ga4: 120_000, // GA4 Data API — 2 min (matches the in-memory TTL)
  clarity: 21_600_000, // Clarity Data Export — 6 h (stays under the 10/day cap)
  razorpay: 3_600_000, // Razorpay settlements — 1 h
  reports: 300_000, // financial/filing reports (heavy full-window aggregation) — 5 min
};

function envOverride(key: CacheKey): number | null {
  const raw = process.env[`ANALYTICS_CACHE_${key.toUpperCase()}_MS`];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Cache TTL in milliseconds for a source (env override → default). */
export function cacheMs(key: CacheKey): number {
  return envOverride(key) ?? DEFAULTS_MS[key];
}

/** Cache TTL in whole seconds (for Next `unstable_cache({ revalidate })`). */
export function cacheSeconds(key: CacheKey): number {
  return Math.max(1, Math.round(cacheMs(key) / 1000));
}

export const ANALYTICS_CACHE = { cacheMs, cacheSeconds } as const;
