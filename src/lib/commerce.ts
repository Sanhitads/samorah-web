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
import { computePromotions, type PromotionSnapshot, type PromoLine, type Coupon } from "@/lib/promotions";

const norm = (s: string) => s.trim().toLowerCase();

/** A priced line the engine taxes. Carries its tax class → HSN + GST rate. */
export interface CommerceLine {
  key: string;
  name: string;
  unitPrice: number; // rupees (source)
  qty: number;
  taxClass: string; // key into TAX_CLASSES
  compositionId?: string;
  // Coupon-targeting identifiers (Phase 1) — OPTIONAL and inert until the promotion engine matches
  // against them. Populated on the AUTHORITATIVE server path (repriceCart); the client preview may fill
  // only what it knows (productType). A line is part of a bundle iff `compositionId` is set; a gift-card
  // line iff `isGiftCard`; a sale-priced line iff `onSale`. No fake product/category flags.
  productId?: string;
  categoryId?: string;
  collectionId?: string; // "chapter" = collection
  productType?: string; // canonical string, e.g. candle | room_spray | linen_spray | gift_card
  variantId?: string;
  onSale?: boolean; // line is currently sale-priced (for sale-item exclusions)
  isGiftCard?: boolean; // gift-card product line (excluded from ordinary coupons by default)
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
  freeShippingBenefit: number; // paise saved by a free-shipping promo (0 if it would ship free anyway)
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
  couponRegistry?: Coupon[]; // server injects DB-loaded active coupons; defaults to config
  firstOrder?: boolean; // customer-eligibility context (Phase 2 #14); undefined = identity unknown
  /** Free-shipping threshold in RUPEES. Server/client injects the admin-editable Site
   *  Settings value; defaults to the code constant (SHIPPING.freeThreshold) so pure
   *  callers and tests are unaffected. Single source of truth: same value drives the
   *  charge here, the cart hint, and the policy copy. */
  freeShippingThresholdInr?: number;
}

/** The full GST-compliant order totals (paise) for a set of lines. */
export function computeOrderTotals(lines: CommerceLine[], opts: ComputeOpts = {}): OrderTotals {
  const promoLines: PromoLine[] = lines.map((l) => ({
    key: l.key,
    unitPrice: l.unitPrice,
    qty: l.qty,
    compositionId: l.compositionId,
    productId: l.productId,
    categoryId: l.categoryId,
    collectionId: l.collectionId,
    productType: l.productType,
    variantId: l.variantId,
    onSale: l.onSale,
    isGiftCard: l.isGiftCard,
  }));
  const promo = computePromotions(promoLines, opts.couponCode, opts.couponRegistry, { firstOrder: opts.firstOrder }); // byLine in paise

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
  const freeThresholdInr = opts.freeShippingThresholdInr ?? SHIPPING.freeThreshold;
  const freeThreshold = toPaise(freeThresholdInr);
  // Free when a promo grants it, the threshold is met, OR there's nothing to ship
  // (a fully-discounted / empty order carries no shipping and therefore no GST).
  const freeShip = promo.freeShipping || goodsTotal >= freeThreshold || goodsTotal <= 0;
  const flatShipping = toPaise(estimateShipping(freeThresholdInr - 1, freeThresholdInr)); // the flat rate that would apply
  const shipping = freeShip ? 0 : flatShipping;
  // What a free-shipping PROMO actually saved (0 if the order would ship free anyway) — the redemption
  // benefit for a free-shipping coupon (points 8/10). goodsTotal>0 && <threshold ⇒ shipping would apply.
  const freeShippingBenefit = promo.freeShipping && goodsTotal > 0 && goodsTotal < freeThreshold ? flatShipping : 0;
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
    freeShippingBenefit,
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
    // Client preview carries only what the cart item knows (productType). The authoritative server path
    // (repriceCart) fills the catalogue ids/onSale; here we surface productType + the gift-card flag so a
    // gift-card line is recognisable even in the preview.
    return { key: i.key, name: i.name, unitPrice: i.price, qty: i.qty, taxClass, compositionId: i.compositionId, productType: i.productType, isGiftCard: (i.productType ?? "").toLowerCase() === "gift_card" };
  });
}
