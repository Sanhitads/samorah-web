/**
 * Commerce money engine — the ONE place order totals are computed, GST-compliant
 * for India. Pipeline (in order):
 *   line totals → promotions (allocated per line) → per-line taxable + GST
 *   extraction at the line's HSN rate → aggregate → shipping + shipping GST
 *   (composite supply) → CGST/SGST vs IGST split → gift cards → amount payable.
 *
 * GST is NEVER extracted from a discounted CART total — each line is discounted
 * (pro-rata) first, then GST is extracted per line at its own rate, then summed.
 * Money is GST-inclusive throughout. `buildCartSummary` / `calculateOrderTotals`
 * are thin views over this engine (unchanged public API).
 */
import {
  DEFAULT_TAX_CLASS,
  SHIPPING,
  STORE_STATE,
  TAX_CLASSES,
  estimateShipping,
} from "@/config/commerce";
import { computePromotions, type AppliedPromotion, type PromoLine } from "@/lib/promotions";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase();

/** A priced line the engine taxes. Carries its tax class → HSN + GST rate. */
export interface CommerceLine {
  key: string;
  name: string;
  unitPrice: number; // GST-inclusive
  qty: number;
  taxClass: string; // key into TAX_CLASSES
  compositionId?: string;
}

export interface LineBreakdown {
  key: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number; // inclusive, pre-discount
  discount: number; // allocated promotion
  netInclusive: number; // lineTotal − discount
  hsn: string;
  gstRate: number;
  taxableValue: number; // extracted from netInclusive
  gst: number;
}

export interface OrderTotals {
  subtotal: number; // Σ lineTotal (inclusive, pre-discount)
  discount: number; // promotions
  goodsTotal: number; // Σ netInclusive
  shipping: number;
  shippingTaxable: number;
  shippingGst: number;
  shippingGstRate: number;
  freeShipping: boolean;
  freeShippingRemaining: number;
  taxableValue: number; // goods + shipping
  gst: number; // goods + shipping
  gstRate: number; // principal rate (for display)
  interState: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  giftCard: number;
  total: number; // goodsTotal + shipping (inclusive)
  payable: number; // total − giftCard
  lines: LineBreakdown[];
  promotions: AppliedPromotion[];
}

const classOf = (taxClass: string) => TAX_CLASSES[taxClass] ?? TAX_CLASSES[DEFAULT_TAX_CLASS];

/** Extract GST from a GST-inclusive amount at a rate. */
function extract(inclusive: number, rate: number): { taxable: number; gst: number } {
  const taxable = round2(inclusive / (1 + rate / 100));
  return { taxable, gst: round2(inclusive - taxable) };
}

/** The principal (dominant-by-value) rate — shipping GST follows it (composite). */
function principalRate(lines: LineBreakdown[]): number {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.gstRate, (byRate.get(l.gstRate) ?? 0) + l.netInclusive);
  let rate = classOf(DEFAULT_TAX_CLASS).gstRate;
  let max = -1;
  for (const [r, v] of byRate) if (v > max) ((max = v), (rate = r));
  return rate;
}

export interface ComputeOpts {
  state?: string;
  giftCard?: number;
  couponCode?: string;
}

/** The full GST-compliant order totals for a set of lines. */
export function computeOrderTotals(lines: CommerceLine[], opts: ComputeOpts = {}): OrderTotals {
  const promoLines: PromoLine[] = lines.map((l) => ({
    key: l.key,
    unitPrice: l.unitPrice,
    qty: l.qty,
    compositionId: l.compositionId,
  }));
  const promo = computePromotions(promoLines, opts.couponCode);

  // Per-line: discount → net → GST extraction at the line's own rate.
  const breakdown: LineBreakdown[] = lines.map((l) => {
    const lineTotal = round2(l.unitPrice * l.qty);
    const discount = round2(promo.byLine[l.key] ?? 0);
    const netInclusive = round2(lineTotal - discount);
    const cls = classOf(l.taxClass);
    const { taxable, gst } = extract(netInclusive, cls.gstRate);
    return {
      key: l.key,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal,
      discount,
      netInclusive,
      hsn: cls.hsn,
      gstRate: cls.gstRate,
      taxableValue: taxable,
      gst,
    };
  });

  const subtotal = round2(breakdown.reduce((s, l) => s + l.lineTotal, 0));
  const discount = round2(breakdown.reduce((s, l) => s + l.discount, 0));
  const goodsTotal = round2(breakdown.reduce((s, l) => s + l.netInclusive, 0));
  const goodsTaxable = round2(breakdown.reduce((s, l) => s + l.taxableValue, 0));
  const goodsGst = round2(breakdown.reduce((s, l) => s + l.gst, 0));

  // Shipping — a taxable composite supply; GST at the principal rate.
  const freeShipping = promo.freeShipping || estimateShipping(goodsTotal) === 0;
  const shipping = freeShipping ? 0 : estimateShipping(goodsTotal);
  const shippingGstRate = principalRate(breakdown);
  const ship = extract(shipping, shippingGstRate);

  const taxableValue = round2(goodsTaxable + ship.taxable);
  const gst = round2(goodsGst + ship.gst);

  const interState = opts.state ? norm(opts.state) !== norm(STORE_STATE) : false;
  const cgst = interState ? 0 : round2(gst / 2);
  const sgst = interState ? 0 : round2(gst - cgst);
  const igst = interState ? gst : 0;

  const total = round2(goodsTotal + shipping);
  const giftCard = round2(Math.min(opts.giftCard ?? 0, total));
  const payable = round2(total - giftCard);

  return {
    subtotal,
    discount,
    goodsTotal,
    shipping,
    shippingTaxable: ship.taxable,
    shippingGst: ship.gst,
    shippingGstRate,
    freeShipping: freeShipping && goodsTotal > 0,
    freeShippingRemaining: goodsTotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.freeThreshold - goodsTotal,
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
    lines: breakdown,
    promotions: promo.applied,
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
