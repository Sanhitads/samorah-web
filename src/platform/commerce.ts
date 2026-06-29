/**
 * Commerce boundary (§14) — editorial reads a PROJECTION, never raw money/stock.
 *
 * Responsibility: define the read-only contract the editorial layer consumes
 * from the commerce domain. It does NOT implement pricing / inventory / tax —
 * that lives in the DB + services + Phases 11–13. Principles: Commerce is its
 * own domain; Domains remain independent.
 */

/** A product reference editorial uses — id and/or slug, nothing more. */
export type ProductRef = string;

/**
 * The read-only commerce facts an editorial component may read, resolved from
 * the commerce domain (variants / pricing). Editorial never sees raw fields.
 */
export interface ProductCommerceProjection {
  productId: string;
  slug: string;
  currency: string; // "INR"
  priceRange: { min: number; max: number; display: string }; // "From ₹2,200"
  inStock: boolean;
  badge?: "sold_out" | "sale" | "hero" | "bestseller" | "low_stock";
}
