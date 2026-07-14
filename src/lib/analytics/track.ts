/**
 * Back-compat shim. The analytics seam now lives in the provider-based module
 * (analytics.ts + events.ts). This file preserves the historical import path
 * `@/lib/analytics/track` so existing call-sites keep working. Prefer importing the
 * typed helpers (trackAddToCart, …) or `track` from `@/lib/analytics/events`.
 */
export { track } from "./analytics";
export type { AnalyticsEvent, TrackParams } from "./types";
