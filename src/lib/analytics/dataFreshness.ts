/**
 * Data-freshness descriptors for every external / cached analytics source (GA4, Clarity, Razorpay, and
 * future services). A source reports when it was fetched, its TTL, and whether it's available; the UI
 * renders "Last updated · Cache age · Availability" from this uniformly. Pure helpers — no I/O.
 */
export type SourceStatus = "healthy" | "stale" | "unavailable";

export interface DataFreshness {
  source: string;
  /** epoch ms when the underlying data was fetched, or null if unknown/unavailable. */
  fetchedAtMs: number | null;
  /** configured cache TTL in ms, or null for uncached/live. */
  ttlMs: number | null;
  available: boolean;
  status: SourceStatus;
}

export function makeFreshness(
  source: string,
  opts: { fetchedAtMs?: number | null; ttlMs?: number | null; available: boolean; nowMs?: number },
): DataFreshness {
  const fetchedAtMs = opts.fetchedAtMs ?? null;
  const ttlMs = opts.ttlMs ?? null;
  let status: SourceStatus = "unavailable";
  if (opts.available) {
    const now = opts.nowMs ?? Date.now();
    const age = fetchedAtMs != null ? now - fetchedAtMs : null;
    status = ttlMs != null && age != null && age > ttlMs ? "stale" : "healthy";
  }
  return { source, fetchedAtMs, ttlMs, available: opts.available, status };
}

/** Human "3m ago" / "just now" label for a cache age; null age → "—". */
export function cacheAgeLabel(fetchedAtMs: number | null, nowMs: number = Date.now()): string {
  if (fetchedAtMs == null) return "—";
  const s = Math.max(0, Math.round((nowMs - fetchedAtMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
