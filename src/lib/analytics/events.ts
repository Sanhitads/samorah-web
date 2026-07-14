/**
 * Typed analytics helpers (review points 4–9, 12). This is the surface UI components
 * import — never GA4/GTM/Clarity directly (review point 19). Each helper builds the
 * correct GA4 ecommerce param shape (currency/value/items…) so call-sites stay simple
 * and events stay consistent. No PII ever (review point 10).
 *
 * Back-compat: `track(name, params)` and the `AnalyticsEvent` type are re-exported, so
 * the pre-existing auth-funnel call-sites keep working unchanged.
 */
import { analytics, track } from "./analytics";
import type { AnalyticsItem } from "./types";

export { track };
export type { AnalyticsEvent, TrackParams, EventParams, AnalyticsItem, ConsentState } from "./types";

const CURRENCY = "INR";
const sumValue = (items: AnalyticsItem[]) => Math.round(items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0) * 100) / 100;
const withCurrency = (items: AnalyticsItem[]): AnalyticsItem[] => items.map((i) => ({ currency: CURRENCY, quantity: 1, ...i }));

// ── Page ──
export const trackPageView = (url: string, title?: string): void => analytics.pageView(url, title);

// ── Product discovery ──
export const trackViewItem = (item: AnalyticsItem): void =>
  track("view_item", { currency: CURRENCY, value: sumValue([item]), items: withCurrency([item]) });

export const trackViewItemList = (listName: string, items: AnalyticsItem[]): void =>
  track("view_item_list", { item_list_name: listName, items: withCurrency(items.map((i) => ({ ...i, item_list_name: listName }))) });

export const trackSelectItem = (listName: string, item: AnalyticsItem): void =>
  track("select_item", { item_list_name: listName, items: withCurrency([{ ...item, item_list_name: listName }]) });

// ── Cart ──
export const trackAddToCart = (item: AnalyticsItem): void =>
  track("add_to_cart", { currency: CURRENCY, value: sumValue([item]), items: withCurrency([item]) });

export const trackRemoveFromCart = (item: AnalyticsItem): void =>
  track("remove_from_cart", { currency: CURRENCY, value: sumValue([item]), items: withCurrency([item]) });

export const trackViewCart = (items: AnalyticsItem[]): void =>
  track("view_cart", { currency: CURRENCY, value: sumValue(items), items: withCurrency(items) });

// ── Wishlist ──
export const trackAddToWishlist = (item: AnalyticsItem): void =>
  track("add_to_wishlist", { currency: CURRENCY, value: sumValue([item]), items: withCurrency([item]) });

export const trackRemoveFromWishlist = (item: AnalyticsItem): void =>
  track("remove_from_wishlist", { items: withCurrency([item]) });

// ── Checkout ──
export const trackBeginCheckout = (items: AnalyticsItem[], coupon?: string): void =>
  track("begin_checkout", { currency: CURRENCY, value: sumValue(items), coupon, items: withCurrency(items) });

export const trackAddShippingInfo = (items: AnalyticsItem[], shippingTier?: string): void =>
  track("add_shipping_info", { currency: CURRENCY, value: sumValue(items), shipping_tier: shippingTier, items: withCurrency(items) });

export const trackAddPaymentInfo = (items: AnalyticsItem[], paymentType?: string): void =>
  track("add_payment_info", { currency: CURRENCY, value: sumValue(items), payment_type: paymentType, items: withCurrency(items) });

export interface PurchasePayload {
  transactionId: string;
  value: number;
  tax?: number;
  shipping?: number;
  coupon?: string;
  items?: AnalyticsItem[];
}
export const trackPurchase = (p: PurchasePayload): void =>
  track("purchase", { transaction_id: p.transactionId, currency: CURRENCY, value: p.value, tax: p.tax, shipping: p.shipping, coupon: p.coupon, items: p.items ? withCurrency(p.items) : undefined });

// ── Search intelligence (review point 1) ──
export const trackSearch = (searchTerm: string, resultsCount?: number): void => track("search", { search_term: searchTerm, results_count: resultsCount });
export const trackSearchZeroResults = (searchTerm: string): void => track("search_zero_results", { search_term: searchTerm });
export const trackSearchAbandoned = (searchTerm: string): void => track("search_abandoned", { search_term: searchTerm });
export const trackAutocompleteUsed = (searchTerm: string): void => track("autocomplete_used", { search_term: searchTerm });

// ── Collection performance (review point 2) ──
export const trackViewCollection = (collection: string): void => track("view_collection", { item_list_name: collection });

// ── Product engagement (review points 3, 6, 7) ──
export const trackProductImpression = (item: AnalyticsItem, listName?: string): void =>
  track("product_impression", { item_list_name: listName, items: withCurrency([{ ...item, item_list_name: listName }]) });
export const trackProductHover = (itemId: string): void => track("product_hover", { item_id: itemId });
export const trackQuickView = (itemId: string): void => track("quick_view", { item_id: itemId });
export const trackGalleryImageView = (itemId: string, index: number): void => track("gallery_image_view", { item_id: itemId, image_index: index });
export const trackGalleryZoom = (itemId: string): void => track("gallery_zoom", { item_id: itemId });
export const trackGalleryFullscreen = (itemId: string): void => track("gallery_fullscreen", { item_id: itemId });
export const trackSelectVariant = (itemId: string, variant: string): void => track("select_variant", { item_id: itemId, item_variant: variant });

// ── Engagement (review points 4, 5) ──
export const trackScrollDepth = (percent: 25 | 50 | 75 | 100, path: string): void => track("scroll_depth", { percent, page_path: path });
export const trackTimeEngaged = (seconds: 30 | 60 | 120 | 300, path: string): void => track("time_engaged", { seconds, page_path: path });

// ── Gift / bundle (review point 8) ──
export const trackViewGiftBox = (): void => track("view_gift_box", {});
export const trackBundleStarted = (): void => track("bundle_started", {});
export const trackBundleCompleted = (value: number, size: number): void => track("bundle_completed", { currency: CURRENCY, value, quantity: size });
export const trackBundleAbandoned = (size: number): void => track("bundle_abandoned", { quantity: size });

// ── Coupon lifecycle (review point 9) ──
export const trackCouponRejected = (coupon: string, reason?: string): void => track("coupon_rejected", { coupon, reason });
export const trackCouponRemoved = (coupon: string): void => track("coupon_removed", { coupon });

// ── Wishlist intelligence (review point 10) ──
export const trackWishlistPurchased = (item: AnalyticsItem): void => track("wishlist_purchased", { currency: CURRENCY, value: sumValue([item]), items: withCurrency([item]) });
export const trackWishlistReminderClick = (itemId: string): void => track("wishlist_reminder_click", { item_id: itemId });

// ── Out-of-stock / Notify-Me (review point 11) — wire when the Notify-Me UI ships ──
export const trackNotifyMeRequested = (itemId: string): void => track("notify_me_requested", { item_id: itemId });
export const trackBackInStockPurchased = (itemId: string): void => track("back_in_stock_purchased", { item_id: itemId });

// ── Referral (review point 12) — wire when the referral feature ships ──
export const trackReferralShared = (channel: string): void => track("referral_shared", { method: channel });
export const trackReferralUsed = (code: string): void => track("referral_used", { code });
export const trackReferralPurchase = (code: string, value: number): void => track("referral_purchase", { code, currency: CURRENCY, value });

// ── Loyalty (review point 13) — wire when loyalty ships ──
export const trackPointsEarned = (points: number): void => track("points_earned", { points });
export const trackPointsRedeemed = (points: number, value: number): void => track("points_redeemed", { points, currency: CURRENCY, value });
export const trackTierUpgraded = (tier: string): void => track("tier_upgraded", { tier });

// ── Blog / editorial (review point 14) ──
export const trackBlogRead = (slug: string, percent: number): void => track("blog_read", { blog_slug: slug, percent });
export const trackBlogRelatedClick = (slug: string): void => track("blog_related_click", { blog_slug: slug });
export const trackBlogProductClick = (slug: string, itemId: string): void => track("blog_product_click", { blog_slug: slug, item_id: itemId });

// ── Artist story (review point 15) — wire when the artist-story section ships ──
export const trackArtistStoryOpen = (artist: string): void => track("artist_story_open", { artist });
export const trackArtistStoryShare = (artist: string, channel: string): void => track("artist_story_share", { artist, method: channel });
export const trackArtistCtaClick = (artist: string): void => track("artist_cta_click", { artist });

// ── Reviews (review point 16) — wire when the review UI ships ──
export const trackReviewExpanded = (itemId: string): void => track("review_expanded", { item_id: itemId });
export const trackReviewPhotoView = (itemId: string): void => track("review_photo_view", { item_id: itemId });
export const trackReviewHelpful = (reviewId: string): void => track("review_helpful", { review_id: reviewId });
export const trackReviewSort = (sort: string): void => track("review_sort", { sort });

// ── Checkout funnel granularity (review point 17) ──
export const trackAddressCompleted = (): void => track("address_completed", {});
export const trackShippingSelected = (tier: string): void => track("shipping_selected", { shipping_tier: tier });
export const trackPaymentSelected = (method: string): void => track("payment_selected", { payment_type: method });
export const trackPaymentRetry = (transactionId: string): void => track("payment_retry", { transaction_id: transactionId });
export const trackPaymentTimeout = (transactionId: string): void => track("payment_timeout", { transaction_id: transactionId });

// ── Marketing ──
export const trackApplyCoupon = (coupon: string, value?: number): void => track("apply_coupon", { coupon, value });

// ── User ──
export const trackLogin = (method: string): void => track("login", { method });
export const trackSignup = (method: string): void => track("sign_up", { method });
export const trackGenerateLead = (source: string): void => track("generate_lead", { source });
export const trackNewsletterSignup = (source: string): void => track("newsletter_signup", { source });
export const trackContactFormSubmit = (source = "contact"): void => track("contact_form_submit", { source });

// ── Payment / errors (Razorpay) ──
export const trackPaymentStarted = (transactionId: string, value: number): void => track("payment_started", { transaction_id: transactionId, currency: CURRENCY, value });
export const trackPaymentSuccess = (transactionId: string, value: number): void => track("payment_success", { transaction_id: transactionId, currency: CURRENCY, value });
export const trackPaymentFailed = (transactionId: string, reason?: string): void => track("payment_failed", { transaction_id: transactionId, reason });
export const trackOrderCompleted = (transactionId: string, value: number): void => track("order_completed", { transaction_id: transactionId, currency: CURRENCY, value });
export const trackCheckoutError = (step: string, reason?: string): void => track("checkout_error", { step, reason });
