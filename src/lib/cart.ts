/**
 * Cart summary (Phase 2) — the pure order-total math the Cart page and drawer
 * read. Takes the cart's full subtotal and the composition promotion, then adds
 * the shipping estimate and extracts the embedded GST. One place, so cart /
 * checkout / invoice never drift. GST-inclusive throughout (extracted, not added).
 */
import { GST_RATE, SHIPPING, estimateShipping } from "@/config/commerce";
import { gstBreakdown } from "@/lib/pricing";

export interface CartSummary {
  subtotal: number; // Σ full line prices (pre-discount, inclusive)
  discount: number; // composition promotion
  goodsTotal: number; // subtotal − discount
  shipping: number; // estimate (0 when free)
  freeShipping: boolean;
  freeShippingRemaining: number; // spend needed to reach free shipping (0 if met)
  gstRate: number;
  gst: number; // GST embedded in (goodsTotal + shipping)
  total: number; // goodsTotal + shipping
}

/** Build the order summary from the cart's subtotal + composition discount. */
export function buildCartSummary(subtotal: number, discount: number): CartSummary {
  const goodsTotal = Math.max(0, subtotal - discount);
  const shipping = estimateShipping(goodsTotal);
  const total = goodsTotal + shipping;
  const { gst } = gstBreakdown(total, GST_RATE);
  return {
    subtotal,
    discount,
    goodsTotal,
    shipping,
    freeShipping: shipping === 0 && goodsTotal > 0,
    freeShippingRemaining: goodsTotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.freeThreshold - goodsTotal,
    gstRate: GST_RATE,
    gst,
    total,
  };
}
