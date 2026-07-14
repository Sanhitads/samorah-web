/**
 * Analytics contracts (review point 19). One vocabulary shared by every provider
 * (GA4, GTM, Clarity) and every call-site. Components import the typed helpers from
 * `events.ts` — never these provider internals — so the UI never speaks "GA4".
 */

/** GA4-recommended ecommerce item. Custom params (review point 9) map onto these. */
export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_category?: string;   // fragrance family / collection
  item_variant?: string;    // vessel · size
  item_list_name?: string;  // the list/collection the item was seen in
  price?: number;
  quantity?: number;
  currency?: string;
}

export type Currency = "INR";

/** Free-form GA4 params. Never carries PII (no email/phone/name) — enforced by convention. */
export type EventParams = Record<string, string | number | boolean | undefined | AnalyticsItem[]>;

/** The canonical event names. Kept as a union so call-sites are typed + greppable. */
export type AnalyticsEvent =
  // ── ecommerce ──
  | "view_item" | "view_item_list" | "select_item"
  | "add_to_cart" | "remove_from_cart" | "view_cart"
  | "begin_checkout" | "add_shipping_info" | "add_payment_info" | "purchase"
  // ── wishlist ──
  | "add_to_wishlist" | "remove_from_wishlist"
  // ── search / discovery ──
  | "search" | "select_promotion" | "view_promotion"
  // ── user ──
  | "login" | "sign_up" | "generate_lead" | "newsletter_signup" | "contact_form_submit"
  // ── marketing ──
  | "apply_coupon"
  // ── payment / errors (Razorpay) ──
  | "payment_started" | "payment_success" | "payment_failed" | "order_completed"
  | "checkout_error"
  // ── auth funnel (pre-existing, retained) ──
  | "login_started" | "login_success" | "login_failure" | "google_login_success"
  | "magic_link_sent" | "magic_link_completed" | "first_login_completed"
  | "cart_merge_occurred" | "wishlist_merge_occurred"
  // ── engagement ──
  | "page_view";

export type TrackParams = EventParams;

/** Consent state — analytics stays silent until the visitor grants it (review point 10). */
export type ConsentState = "granted" | "denied" | "unset";

/** Every provider implements this. Add a provider (Meta Pixel…) = implement + register. */
export interface AnalyticsProvider {
  readonly name: string;
  readonly enabled: boolean;
  pageView(url: string, title?: string): void;
  event(name: AnalyticsEvent, params: EventParams): void;
}
