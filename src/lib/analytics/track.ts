/**
 * Analytics seam (Principle 24 — "Events over Guesswork": one seam, not scattered
 * gtag calls). Every meaningful interaction flows through track(). It pushes to
 * gtag/dataLayer when GA is present and is a safe no-op otherwise — so wiring the
 * real GA4 measurement ID later (NEXT_PUBLIC_GA_ID) needs zero call-site changes.
 */
export type AnalyticsEvent =
  | "view_item"
  | "view_item_list"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "purchase"
  | "search"
  | "sign_up"
  | "newsletter_signup";

export type TrackParams = Record<string, unknown>;

export function track(event: AnalyticsEvent, params: TrackParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.gtag === "function") {
      w.gtag("event", event, params);
    } else {
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ event, ...params });
    }
    if (process.env.NODE_ENV !== "production") console.debug("[track]", event, params);
  } catch {
    /* analytics must never break the app */
  }
}
