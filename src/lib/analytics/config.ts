/**
 * Analytics configuration — IDs come from the environment, never hardcoded (review
 * point 1). Supports the new `NEXT_PUBLIC_GA_MEASUREMENT_ID` and the legacy
 * `NEXT_PUBLIC_GA_ID` (whichever is set). A provider is "configured" only when its ID
 * is present, so unconfigured providers silently no-op.
 */
export const analyticsConfig = {
  ga4Id: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_GA_ID ?? "",
  gtmId: process.env.NEXT_PUBLIC_GTM_ID ?? "",
  clarityId: process.env.NEXT_PUBLIC_CLARITY_ID ?? "",
  /** Meta Pixel — Phase 3, "not yet". Reserved so the provider can light up via env alone. */
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "",
} as const;

/** Analytics only runs in production builds (review point 2) — unless explicitly forced
 *  on for local DebugView testing via NEXT_PUBLIC_ANALYTICS_DEBUG=1 (review point 13). */
export const analyticsEnabled =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "1";

export const hasGa4 = () => !!analyticsConfig.ga4Id;
export const hasGtm = () => !!analyticsConfig.gtmId;
export const hasClarity = () => !!analyticsConfig.clarityId;

/** True in dev-debug mode — providers echo to the console for DebugView parity. */
export const analyticsDebug = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "1" || process.env.NODE_ENV !== "production";
