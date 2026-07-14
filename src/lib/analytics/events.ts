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

// ── Search ──
export const trackSearch = (searchTerm: string): void => track("search", { search_term: searchTerm });

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
