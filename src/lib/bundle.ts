/**
 * Discovery Composition domain (Phase 10) — the "Compose Any Three" rules, as
 * pure functions over lean candle view-models. Single-vessel: the customer
 * picks a vessel first, then composes three 100g Signature Candles from that
 * vessel. Exactly three, no duplicate fragrances, 15% off the set. Real
 * per-variant prices flow in via each candle's per-vessel option.
 */
import { formatINR } from "@/lib/pricing";

/** The one selectable size — the Discovery Collection is 100g candles only. */
export const BUNDLE_SIZE_LABEL = "100g";
/** Compose exactly this many candles. */
export const BUNDLE_SIZE = 3;
/** Automatic composition discount. */
export const BUNDLE_DISCOUNT = 0.15; // 15%

/** A vessel offered at launch (glass, ceramic) plus the future terracotta. */
export interface BundleVesselDef {
  key: string; // enum value — "glass" | "ceramic" | "terracotta"
  name: string; // "Glass Edition"
  material: string; // "Glass" — used in the panel ("Glass Composition")
  blurb: string;
  comingSoon: boolean;
}

/** Vessel editions, in display order. Terracotta is future-proofed (disabled). */
export const BUNDLE_VESSELS: BundleVesselDef[] = [
  {
    key: "glass",
    name: "Glass Edition",
    material: "Glass",
    blurb: "Clear, timeless elegance. Signature transparent vessels.",
    comingSoon: false,
  },
  {
    key: "ceramic",
    name: "Ceramic Edition",
    material: "Ceramic",
    blurb: "Soft matte finish. A contemporary, handcrafted feel.",
    comingSoon: false,
  },
  {
    key: "terracotta",
    name: "Terracotta Edition",
    material: "Terracotta",
    blurb: "Natural, earth-fired warmth.",
    comingSoon: true,
  },
];

/** The chapter a candle belongs to — its Samorah story, for display + filter. */
export interface BundleChapter {
  slug: string; // "dessert-chapter"
  key: string; // filter key — "dessert"
  short: string; // "Dessert"
  volume: string | null; // "Vol. I"
  name: string; // "Dessert Chapter"
  order: number; // volume order, for filter arrangement
}

/** Canonical chapter identities (volume comes from the collection row). */
export const CHAPTER_META: Record<string, { key: string; short: string; order: number }> = {
  "dessert-chapter": { key: "dessert", short: "Dessert", order: 1 },
  "the-wild-within": { key: "wild", short: "Wild", order: 2 },
  "mood-library": { key: "mood", short: "Mood", order: 3 },
  "nature-chapter": { key: "nature", short: "Nature", order: 4 },
};

/** A candle's 100g variant for one vessel — the sellable option. */
export interface BundleVesselOption {
  vessel: string; // "glass"
  variantId: string;
  size: string; // "100g"
  price: number; // effective price
  inStock: boolean;
}

/** A candle eligible for the composition — the lean shape the builder needs. */
export interface BundleCandle {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  chapter: BundleChapter | null;
  image: { url: string; alt: string };
  /** 100g options keyed by vessel — a candle appears for a vessel it offers. */
  vessels: BundleVesselOption[];
}

/** A chosen candle + the vessel option it resolves to (for pricing + cart). */
export interface BundleSelection {
  candle: BundleCandle;
  option: BundleVesselOption;
}

export interface BundleLine {
  selection: BundleSelection;
  unit: number; // discounted unit price (rounded to the rupee)
}

export interface BundleComposition {
  count: number;
  complete: boolean;
  lines: BundleLine[];
  regular: number; // Σ option prices
  total: number; // Σ discounted units (what the cart charges)
  saving: number; // regular − total
  savingPct: number; // whole %
  regularLabel: string;
  totalLabel: string;
  savingLabel: string;
}

/** Per-candle composition price — the discount is applied per line so the cart
 *  subtotal matches the composition total exactly (no rounding drift). */
export function bundleUnitPrice(price: number): number {
  return Math.round(price * (1 - BUNDLE_DISCOUNT));
}

/** The capitalised vessel material for display ("glass" → "Glass"). */
export function vesselLabel(key: string): string {
  const def = BUNDLE_VESSELS.find((v) => v.key === key);
  return def ? def.material : key.charAt(0).toUpperCase() + key.slice(1);
}

/** Resolve a candle's option for a vessel (undefined when not offered there). */
export function optionFor(candle: BundleCandle, vessel: string): BundleVesselOption | undefined {
  return candle.vessels.find((v) => v.vessel === vessel);
}

/** Compute the running composition from the current selection. */
export function composeBundle(selections: BundleSelection[]): BundleComposition {
  const lines: BundleLine[] = selections.map((selection) => ({
    selection,
    unit: bundleUnitPrice(selection.option.price),
  }));
  const regular = selections.reduce((sum, s) => sum + s.option.price, 0);
  const total = lines.reduce((sum, l) => sum + l.unit, 0);
  const saving = regular - total;
  return {
    count: selections.length,
    complete: selections.length === BUNDLE_SIZE,
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

export interface CompositionPreview {
  count: number;
  complete: boolean;
  regular: number;
  total: number;
  saving: number;
  savingPct: number;
  regularLabel: string;
  totalLabel: string;
  savingLabel: string;
}

/** Running composition totals from a set of full prices (the shared store's
 *  items). The 15% is applied per line via bundleUnitPrice, so the preview and
 *  the cart-level promotion always agree to the rupee. */
export function composeComposition(prices: number[]): CompositionPreview {
  const regular = prices.reduce((sum, p) => sum + p, 0);
  const total = prices.reduce((sum, p) => sum + bundleUnitPrice(p), 0);
  const saving = regular - total;
  return {
    count: prices.length,
    complete: prices.length === BUNDLE_SIZE,
    regular,
    total,
    saving,
    savingPct: regular > 0 ? Math.round((saving / regular) * 100) : 0,
    regularLabel: formatINR(regular),
    totalLabel: formatINR(total),
    savingLabel: formatINR(saving),
  };
}

/** The composition panel's progress line. */
export function bundleProgress(count: number): string {
  if (count >= BUNDLE_SIZE) return "Composition Complete";
  return `${count} of ${BUNDLE_SIZE}`;
}
