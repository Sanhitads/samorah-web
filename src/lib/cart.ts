/**
 * Cart summary — the lightweight order-total view the Cart page + drawer read.
 * A thin projection over the GST-compliant money engine (lib/commerce.ts), so
 * cart / checkout / invoice never drift. GST-inclusive throughout.
 */
import { computeOrderTotals, toCommerceLines } from "@/lib/commerce";
import { SHIPPING } from "@/config/commerce";

/** The minimal cart-line shape the summary needs (CartItem satisfies it). */
export interface SummaryLine {
  key: string;
  name: string;
  price: number;
  qty: number;
  productType?: string;
  compositionId?: string;
}

export interface CartSummary {
  subtotal: number; // Σ full line prices (pre-discount, inclusive)
  discount: number; // promotions
  goodsTotal: number; // subtotal − discount
  shipping: number;
  freeShipping: boolean;
  freeShippingRemaining: number;
  gstRate: number; // principal rate (display)
  gst: number; // GST embedded in (goods + shipping)
  total: number; // goodsTotal + shipping
}

/** Build the cart summary from the cart lines. `freeThresholdInr` (admin-configured, from
 *  the ShippingConfig context) keeps the cart's free-shipping hint in step with the server
 *  charge; defaults to the code constant. */
export function buildCartSummary(items: SummaryLine[], freeThresholdInr: number = SHIPPING.freeThreshold): CartSummary {
  const t = computeOrderTotals(toCommerceLines(items), { freeShippingThresholdInr: freeThresholdInr });
  return {
    subtotal: t.subtotal,
    discount: t.discount,
    goodsTotal: t.goodsTotal,
    shipping: t.shipping,
    freeShipping: t.freeShipping,
    freeShippingRemaining: t.freeShippingRemaining,
    gstRate: t.gstRate,
    gst: t.gst,
    total: t.total,
  };
}
