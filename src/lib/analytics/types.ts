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
  // ── search / discovery (review point 1) ──
  | "search" | "search_zero_results" | "search_abandoned" | "autocomplete_used"
  | "select_promotion" | "view_promotion"
  // ── collection performance (review point 2) ──
  | "view_collection"
  // ── product engagement (review points 3, 6, 7) ──
  | "product_impression" | "product_hover" | "quick_view"
  | "gallery_image_view" | "gallery_zoom" | "gallery_fullscreen" | "select_variant"
  // ── engagement (review points 4, 5) ──
  | "scroll_depth" | "time_engaged"
  // ── gift / bundle (review point 8) ──
  | "view_gift_box" | "bundle_started" | "bundle_completed" | "bundle_abandoned"
  // ── coupon lifecycle (review point 9) ──
  | "coupon_rejected" | "coupon_removed"
  // ── wishlist intelligence (review points 9, 10) ──
  | "wishlist_opened" | "wishlist_shared" | "wishlist_purchased" | "wishlist_reminder_click"
  // ── out-of-stock / notify-me (review point 11) ──
  | "notify_me_requested" | "back_in_stock_purchased"
  // ── referral (review point 12) ──
  | "referral_shared" | "referral_used" | "referral_purchase"
  // ── loyalty (review point 13) ──
  | "points_earned" | "points_redeemed" | "tier_upgraded"
  // ── blog / editorial (review point 14) ──
  | "blog_read" | "blog_related_click" | "blog_product_click"
  // ── artist story (review point 15) ──
  | "artist_story_open" | "artist_story_share" | "artist_cta_click"
  // ── reviews (review point 16) ──
  | "review_expanded" | "review_photo_view" | "review_helpful" | "review_sort"
  // ── checkout funnel granularity (review point 17) ──
  | "address_completed" | "shipping_selected" | "payment_selected" | "payment_retry" | "payment_timeout"
  // ── user ──
  | "login" | "sign_up" | "generate_lead" | "newsletter_signup" | "contact_form_submit"
  // ── marketing ──
  | "apply_coupon"
  // ── payment / errors (Razorpay) ──
  | "payment_started" | "payment_success" | "payment_failed" | "order_completed"
  | "checkout_error"
  // ── authoritative server-side (review priority B) ──
  | "refund" | "shipment_dispatched" | "shipment_delivered" | "shipment_rto"
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
