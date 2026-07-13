/**
 * Lightweight client analytics dispatcher (review point 14). Fires a GA4 event when
 * gtag is present (the storefront loads GA from site settings), and logs in dev for
 * visibility. Never throws. Centralising the event names keeps them consistent and
 * greppable — the funnel from "login started" to "first login completed".
 */
export type AnalyticsEvent =
  | "login_started"
  | "login_success"
  | "login_failure"
  | "google_login_success"
  | "magic_link_sent"
  | "magic_link_completed"
  | "cart_merge_occurred"
  | "wishlist_merge_occurred"
  | "first_login_completed";

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = typeof window !== "undefined" ? (window as any).gtag : undefined;
    if (typeof g === "function") g("event", event, props);
    if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") console.debug("[analytics]", event, props);
  } catch { /* analytics must never break UX */ }
}
