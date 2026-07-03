/**
 * Commerce configuration — the single place for tax + shipping constants the
 * storefront reads (the Cart estimate today; the invoice + Shiprocket rate card
 * will read the same values in Phases 12–13). Money is stored GST-inclusive, so
 * GST is *extracted* from totals for display, never added on top.
 */

/** GST rate for scented candles — HSN 3406 (12%). Confirm the HSN/rate with a CA
 *  before the first live invoice (BRD §9.1). Per-line HSN arrives with invoicing. */
export const GST_RATE = 12;

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
