// Pricing domain — pure functions over priceable catalog rows (products or
// variants). No I/O, no formatting opinions baked into services or UI. Money is
// stored as whole rupees (GST-inclusive MRP) per the seed; GST is *extracted*
// from that inclusive amount for invoice display, never added on top.

export interface Priceable {
  price: number;
  sale_price?: number | null;
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Format a rupee amount, e.g. 1299 -> "₹1,299". */
export function formatINR(amount: number): string {
  return INR.format(amount);
}

/** True when a usable sale price is set below the list price. */
export function isOnSale(p: Priceable): boolean {
  return p.sale_price != null && p.sale_price < p.price;
}

/** The amount actually charged: sale price when on sale, else list price. */
export function effectivePrice(p: Priceable): number {
  return isOnSale(p) ? (p.sale_price as number) : p.price;
}

/** Absolute amount saved vs list price (0 when not on sale). */
export function savings(p: Priceable): number {
  return isOnSale(p) ? p.price - (p.sale_price as number) : 0;
}

/** Discount as a rounded whole percentage (0 when not on sale). */
export function discountPercent(p: Priceable): number {
  return isOnSale(p) ? Math.round((savings(p) / p.price) * 100) : 0;
}

export interface PriceDisplay {
  /** Formatted price the customer pays. */
  current: string;
  /** Formatted struck-through list price, or null when not on sale. */
  original: string | null;
  onSale: boolean;
  /** Formatted savings ("₹120"), or null when not on sale. */
  savings: string | null;
  /** Whole-percent discount (0 when not on sale). */
  discountPercent: number;
}

/** Everything a price tag needs (handles the sale/struck-through case). */
export function formatPrice(p: Priceable): PriceDisplay {
  const onSale = isOnSale(p);
  return {
    current: formatINR(effectivePrice(p)),
    original: onSale ? formatINR(p.price) : null,
    onSale,
    savings: onSale ? formatINR(savings(p)) : null,
    discountPercent: discountPercent(p),
  };
}

export interface PriceRange {
  min: number;
  max: number;
  /** "₹585" when uniform, else "₹585 – ₹1,439". Empty string when no items. */
  display: string;
}

/** Effective price span across variants (for "from ₹X" / range labels). */
export function priceRange(items: Priceable[]): PriceRange {
  if (items.length === 0) return { min: 0, max: 0, display: "" };
  const prices = items.map(effectivePrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    min,
    max,
    display: min === max ? formatINR(min) : `${formatINR(min)} – ${formatINR(max)}`,
  };
}

export interface GstBreakdown {
  /** Pre-tax taxable value extracted from the inclusive amount. */
  taxable: number;
  /** GST portion contained within the inclusive amount. */
  gst: number;
}

/**
 * Extract the GST component from a GST-inclusive amount (the storefront shows
 * inclusive MRP; the invoice shows the embedded tax). e.g. ₹1,299 @ 12% ->
 * taxable ₹1,159.82, gst ₹139.18. CGST/SGST vs IGST split happens at invoicing.
 */
export function gstBreakdown(inclusiveAmount: number, gstRate: number): GstBreakdown {
  const taxable = inclusiveAmount / (1 + gstRate / 100);
  return { taxable: round2(taxable), gst: round2(inclusiveAmount - taxable) };
}
