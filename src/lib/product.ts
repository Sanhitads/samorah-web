// Product domain — pure functions over catalog rows. Structural input types
// (not the generated Row types) keep these decoupled: any object with the
// needed fields works, including the typed service results.

import { isOnSale } from "@/lib/pricing";

// ── Stock ─────────────────────────────────────────────────────────────────────

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface StockLike {
  stock: number;
  low_stock_threshold: number;
}

/** Stock status for a single variant (BRD §10 inventory thresholds). */
export function stockStatus(v: StockLike): StockStatus {
  if (v.stock <= 0) return "out_of_stock";
  if (v.stock <= v.low_stock_threshold) return "low_stock";
  return "in_stock";
}

export function isInStock(v: StockLike): boolean {
  return v.stock > 0;
}

/** Sum of sellable stock across variants. */
export function totalStock(variants: StockLike[]): number {
  return variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
}

// ── Variant selection ───────────────────────────────────────────────────────

export interface VariantLike extends StockLike {
  id: string;
  vessel_type: string | null;
  size_label: string | null;
  is_active: boolean;
  sort_order: number;
}

const activeSorted = <T extends VariantLike>(variants: T[]): T[] =>
  variants.filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order);

/** Preselected variant: first in-stock active variant, else first active. */
export function defaultVariant<T extends VariantLike>(variants: T[]): T | undefined {
  const active = activeSorted(variants);
  return active.find(isInStock) ?? active[0];
}

/** Find the active variant for a given vessel + size pair. */
export function findVariant<T extends VariantLike>(
  variants: T[],
  vessel: string,
  size: string,
): T | undefined {
  return variants.find(
    (v) => v.is_active && v.vessel_type === vessel && v.size_label === size,
  );
}

const distinct = <T>(arr: T[]): T[] => [...new Set(arr)];

/** Distinct vessels offered (active variants), in sort order. */
export function availableVessels(variants: VariantLike[]): string[] {
  return distinct(
    activeSorted(variants)
      .map((v) => v.vessel_type)
      .filter((x): x is string => x != null),
  );
}

/** Distinct sizes offered (active variants), in sort order. */
export function availableSizes(variants: VariantLike[]): string[] {
  return distinct(
    activeSorted(variants)
      .map((v) => v.size_label)
      .filter((x): x is string => x != null),
  );
}

export interface Combination {
  vessel: string;
  size: string;
  variantId: string;
  inStock: boolean;
}

/** Every selectable vessel×size combination with its availability. */
export function availableCombinations(variants: VariantLike[]): Combination[] {
  return activeSorted(variants)
    .filter((v) => v.vessel_type && v.size_label)
    .map((v) => ({
      vessel: v.vessel_type as string,
      size: v.size_label as string,
      variantId: v.id,
      inStock: isInStock(v),
    }));
}

// ── Images ────────────────────────────────────────────────────────────────────

export interface ImageLike {
  url: string;
  alt_text?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
}

/** Primary image: the flagged one, else lowest sort_order, else first. */
export function primaryImage<T extends ImageLike>(
  images: T[] | null | undefined,
): T | undefined {
  if (!images || images.length === 0) return undefined;
  return (
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
  );
}

const GRADIENT_PREFIX = "gradient:";

/** Is this a dev gradient placeholder rather than a real (Cloudinary) photo? */
export function isGradientPlaceholder(url: string): boolean {
  return url.startsWith(GRADIENT_PREFIX);
}

/** Gradient class from a placeholder url ("gradient:grad-chai" -> "grad-chai"). */
export function gradientClass(url: string): string | null {
  return isGradientPlaceholder(url) ? url.slice(GRADIENT_PREFIX.length) : null;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export type ProductBadge =
  | "sold_out"
  | "sale"
  | "hero"
  | "bestseller"
  | "low_stock"
  | null;

export interface BadgeInput {
  is_hero?: boolean | null;
  is_featured?: boolean | null;
  price?: number;
  sale_price?: number | null;
  /** Optional variant stock signals; enables sold_out / low_stock badges. */
  variants?: StockLike[];
}

/**
 * Single most-relevant badge for a product card. Priority: sold out > on sale >
 * hero > bestseller > low stock. Returns null when nothing noteworthy applies.
 */
export function productBadge(p: BadgeInput): ProductBadge {
  const hasStockData = p.variants != null && p.variants.length > 0;
  const stock = hasStockData ? totalStock(p.variants as StockLike[]) : null;

  if (stock === 0) return "sold_out";
  if (p.price != null && isOnSale({ price: p.price, sale_price: p.sale_price })) return "sale";
  if (p.is_hero) return "hero";
  if (p.is_featured) return "bestseller";
  if (stock != null && stock <= 10) return "low_stock";
  return null;
}
