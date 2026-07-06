/**
 * Commerce money engine — the ONE place order totals are computed, GST-compliant
 * for India, in INTEGER PAISE (no float drift). Pipeline (in order):
 *   line totals → promotions (allocated per line) → per-line taxable + GST
 *   extraction at the line's OWN HSN rate → aggregate → shipping + shipping GST
 *   (composite supply, principal rate) → CGST/SGST vs IGST split → gift card
 *   (payment) → amount payable.
 *
 * GST is NEVER extracted from a discounted CART total — each line is discounted
 * (pro-rata) first, then GST is extracted per line, then summed. Every money
 * field returned is PAISE (integer); the UI is the only place it becomes rupees.
 * `buildCartSummary` / `calculateOrderTotals` are thin views over this engine.
 */
import {
  COMMERCE_ENGINE_VERSION,
  DEFAULT_TAX_CLASS,
  PRICING_VERSION,
  SHIPPING,
  STORE_STATE,
  TAX_CLASSES,
  TAX_VERSION,
  estimateShipping,
} from "@/config/commerce";
import { toPaise, extractPaise } from "@/lib/money";
import { computePromotions, type PromotionSnapshot, type PromoLine } from "@/lib/promotions";

const norm = (s: string) => s.trim().toLowerCase();

/** A priced line the engine taxes. Carries its tax class → HSN + GST rate. */
export interface CommerceLine {
  key: string;
  name: string;
  unitPrice: number; // rupees (source)
  qty: number;
  taxClass: string; // key into TAX_CLASSES
  compositionId?: string;
}

/** All money fields in PAISE (integer). */
export interface LineBreakdown {
  key: string;
  name: string;
  qty: number;
  unitPrice: number; // paise
  lineTotal: number; // paise, inclusive, pre-discount
  discount: number; // paise allocated
  netInclusive: number; // paise
  hsn: string;
  gstRate: number;
  taxableValue: number; // paise
  gst: number; // paise
}

/** All money fields in PAISE (integer). */
export interface OrderTotals {
  subtotal: number;
  discount: number;
  goodsTotal: number;
  shipping: number;
  shippingTaxable: number;
  shippingGst: number;
  shippingGstRate: number;
  freeShipping: boolean;
  freeShippingRemaining: number; // paise
  taxableValue: number;
  gst: number;
  gstRate: number; // principal rate (display)
  interState: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  giftCard: number;
  total: number;
  payable: number;
  // Provenance stamps — frozen on the order; historical invoices never recompute.
  taxVersion: string; // HSN/rate table version
  pricingVersion: string; // shipping + promotion rule version
  commerceVersion: string; // calculation engine version
  lines: LineBreakdown[];
  promotions: PromotionSnapshot[];
  promotionsSkipped: { code: string; reason: string }[];
}

const classOf = (taxClass: string) => TAX_CLASSES[taxClass] ?? TAX_CLASSES[DEFAULT_TAX_CLASS];

/** Shipping GST rate = the HIGHEST rate present in the cart. Freight bundled with
 *  mixed-rate goods is a composite/mixed supply that attracts the highest rate
 *  (conservative + matches the tax matrix): all-candle → 12%, candle+spray → 18%. */
function shippingRate(lines: LineBreakdown[]): number {
  if (lines.length === 0) return classOf(DEFAULT_TAX_CLASS).gstRate;
  return Math.max(...lines.map((l) => l.gstRate));
}

export interface ComputeOpts {
  state?: string;
  giftCard?: number; // paise
  couponCode?: string;
}

/** The full GST-compliant order totals (paise) for a set of lines. */
export function computeOrderTotals(lines: CommerceLine[], opts: ComputeOpts = {}): OrderTotals {
  const promoLines: PromoLine[] = lines.map((l) => ({
    key: l.key,
    unitPrice: l.unitPrice,
    qty: l.qty,
    compositionId: l.compositionId,
  }));
  const promo = computePromotions(promoLines, opts.couponCode); // byLine in paise

  // Per line: discount → net → GST extraction at the line's own rate (paise).
  const breakdown: LineBreakdown[] = lines.map((l) => {
    const unitPrice = toPaise(l.unitPrice);
    const lineTotal = unitPrice * l.qty;
    const discount = promo.byLine[l.key] ?? 0;
    const netInclusive = lineTotal - discount;
    const cls = classOf(l.taxClass);
    const { taxable, gst } = extractPaise(netInclusive, cls.gstRate);
    return {
      key: l.key,
      name: l.name,
      qty: l.qty,
      unitPrice,
      lineTotal,
      discount,
      netInclusive,
      hsn: cls.hsn,
      gstRate: cls.gstRate,
      taxableValue: taxable,
      gst,
    };
  });

  const subtotal = breakdown.reduce((s, l) => s + l.lineTotal, 0);
  const discount = breakdown.reduce((s, l) => s + l.discount, 0);
  const goodsTotal = breakdown.reduce((s, l) => s + l.netInclusive, 0);
  const goodsTaxable = breakdown.reduce((s, l) => s + l.taxableValue, 0);
  const goodsGst = breakdown.reduce((s, l) => s + l.gst, 0);

  // Shipping — a taxable composite supply; GST at the principal rate.
  const freeThreshold = toPaise(SHIPPING.freeThreshold);
  // Free when a promo grants it, the threshold is met, OR there's nothing to ship
  // (a fully-discounted / empty order carries no shipping and therefore no GST).
  const freeShip = promo.freeShipping || goodsTotal >= freeThreshold || goodsTotal <= 0;
  const shipping = freeShip ? 0 : toPaise(estimateShipping(SHIPPING.freeThreshold - 1)); // flat rate
  const shippingGstRate = shippingRate(breakdown);
  const ship = extractPaise(shipping, shippingGstRate);

  const taxableValue = goodsTaxable + ship.taxable;
  const gst = goodsGst + ship.gst;

  const interState = opts.state ? norm(opts.state) !== norm(STORE_STATE) : false;
  const cgst = interState ? 0 : Math.round(gst / 2);
  const sgst = interState ? 0 : gst - cgst;
  const igst = interState ? gst : 0;

  const total = goodsTotal + shipping;
  const giftCard = Math.min(opts.giftCard ?? 0, total);
  const payable = total - giftCard;

  return {
    subtotal,
    discount,
    goodsTotal,
    shipping,
    shippingTaxable: ship.taxable,
    shippingGst: ship.gst,
    shippingGstRate,
    freeShipping: freeShip && goodsTotal > 0,
    freeShippingRemaining: goodsTotal >= freeThreshold ? 0 : freeThreshold - goodsTotal,
    taxableValue,
    gst,
    gstRate: shippingGstRate,
    interState,
    cgst,
    sgst,
    igst,
    giftCard,
    total,
    payable,
    taxVersion: TAX_VERSION,
    pricingVersion: PRICING_VERSION,
    commerceVersion: COMMERCE_ENGINE_VERSION,
    lines: breakdown,
    promotions: promo.applied,
    promotionsSkipped: promo.skipped,
  };
}

/** Cart item → engine line. Tax class is derived from the product type today;
 *  when variants carry their own HSN/rate (Beat 2), that overrides this. */
export function toCommerceLines(
  items: { key: string; name: string; price: number; qty: number; productType?: string; compositionId?: string }[],
): CommerceLine[] {
  return items.map((i) => {
    const t = (i.productType ?? "").toLowerCase();
    const taxClass = t.includes("linen")
      ? "linen_spray"
      : t.includes("room") || t.includes("spray")
        ? "room_spray"
        : "candle";
    return { key: i.key, name: i.name, unitPrice: i.price, qty: i.qty, taxClass, compositionId: i.compositionId };
  });
}
