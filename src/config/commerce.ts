/**
 * Commerce configuration — the single place for tax + shipping constants the
 * storefront reads (the Cart estimate today; the invoice + Shiprocket rate card
 * will read the same values in Phases 12–13). Money is stored GST-inclusive, so
 * GST is *extracted* from totals for display, never added on top.
 */

/** GST rate for scented candles — HSN 3406 (12%). Confirm the HSN/rate with a CA
 *  before the first live invoice (BRD §9.1). Per-line HSN arrives with invoicing. */
export const GST_RATE = 12;

/** The registered place of supply. Intra-state → CGST+SGST; inter-state → IGST.
 *  Set to the business's GST-registered state before the first live order. */
export const STORE_STATE = "Maharashtra";

/** Indian states + UTs — the checkout state selector + GST place-of-supply. */
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman & Nicobar Islands", "Chandigarh", "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

/** Shipping estimate (provisional until Shiprocket serviceability, Phase 13). */
export const SHIPPING = {
  /** Free standard shipping at or above this order value (₹). */
  freeThreshold: 1499,
  /** Flat standard rate below the threshold (₹). */
  flatRate: 99,
};

/** Estimated standard shipping for a goods total (post-discount). */
export function estimateShipping(goodsTotal: number): number {
  if (goodsTotal <= 0) return 0;
  return goodsTotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.flatRate;
}

/** The free-shipping threshold as a formatted rupee string ("₹1,499"). */
export function freeShippingLabel(): string {
  return `₹${SHIPPING.freeThreshold.toLocaleString("en-IN")}`;
}

/**
 * The one canonical shipping sentence — every surface (PDP, cart, checkout,
 * footer, FAQ, policy) reads THIS, so the threshold is never hardcoded twice.
 */
export function shippingPolicySentence(): string {
  return `Complimentary standard shipping within India on orders over ${freeShippingLabel()}.`;
}
