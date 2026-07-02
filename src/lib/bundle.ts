/**
 * Bundle domain (Phase 10) — the "Build Your Collection" composition rules, as
 * pure functions over lean candle view-models. No I/O, no formatting opinions in
 * the UI. The rule: compose exactly BUNDLE_SIZE candles and save BUNDLE_DISCOUNT
 * off the set. Real per-variant prices flow in via `basePrice`.
 */
import { formatINR } from "@/lib/pricing";

/** A candle eligible for the bundle — the lean shape the builder + cart need. */
export interface BundleCandle {
  id: string;
  slug: string;
  name: string;
  tagline: string | null; // a small editorial descriptor under the name
  family: string | null; // fragrance_family — the filter facet
  image: { url: string; alt: string };
  basePrice: number; // effective price of the default in-stock variant
  vessel: string; // default variant vessel (carried onto the cart line)
  size: string; // default variant size
  inStock: boolean;
}

/** Bundle rule: pick exactly BUNDLE_SIZE candles, BUNDLE_DISCOUNT off the set. */
export const BUNDLE_SIZE = 3;
export const BUNDLE_DISCOUNT = 0.15; // 15%

export interface BundleLine {
  candle: BundleCandle;
  /** Discounted unit price for this candle (rounded to the rupee). */
  unit: number;
}

export interface BundleComposition {
  count: number;
  complete: boolean;
  lines: BundleLine[];
  regular: number; // Σ base prices
  total: number; // Σ discounted units (what the cart charges)
  saving: number; // regular − total
  savingPct: number; // whole %
  regularLabel: string;
  totalLabel: string;
  savingLabel: string;
}

/** Per-candle bundle price — the discount is applied per line so the cart
 *  subtotal matches the composition total exactly (no rounding drift). */
export function bundleUnitPrice(basePrice: number): number {
  return Math.round(basePrice * (1 - BUNDLE_DISCOUNT));
}

/** Compute the running composition from the current selection. */
export function composeBundle(selected: BundleCandle[]): BundleComposition {
  const lines: BundleLine[] = selected.map((candle) => ({
    candle,
    unit: bundleUnitPrice(candle.basePrice),
  }));
  const regular = selected.reduce((sum, c) => sum + c.basePrice, 0);
  const total = lines.reduce((sum, l) => sum + l.unit, 0);
  const saving = regular - total;
  return {
    count: selected.length,
    complete: selected.length === BUNDLE_SIZE,
    lines,
    regular,
    total,
    saving,
    savingPct: regular > 0 ? Math.round((saving / regular) * 100) : 0,
    regularLabel: formatINR(regular),
    totalLabel: formatINR(total),
    savingLabel: formatINR(saving),
  };
}

/** The composition panel's status line, driven by how many are chosen. */
export function bundleStatus(count: number): string {
  if (count === 0) return "Select three candles to compose your set";
  if (count < BUNDLE_SIZE) {
    const left = BUNDLE_SIZE - count;
    return `${left} more ${left === 1 ? "candle" : "candles"} to complete your set`;
  }
  return "Your set is ready";
}
