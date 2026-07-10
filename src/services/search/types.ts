/**
 * Search layering — shared contracts.
 *
 *   Admin (page/box)
 *        ↓  calls
 *   SearchService   ← permissions · ranking · highlighting · grouping · pagination · analytics · logging
 *        ↓  asks
 *   SearchProvider  ← ONE job: retrieve raw matches for a query
 *        ↓
 *   Implementation  (ILIKE today · PG-FTS / Meilisearch / OpenSearch later)
 *
 * The provider is deliberately dumb: it knows how to *retrieve*, nothing about
 * who's allowed to see what, how to rank, or how results are shaped for the UI.
 * Swapping the engine touches only a provider file; policy/presentation stay put.
 */

export type SearchResource = "orders" | "customers" | "products" | "coupons" | "returns" | "pages";

/** A raw match from a provider — normalised retrieval only, no policy or href. */
export interface RawHit {
  resource: SearchResource;
  ref: string;         // the identifier the UI links on (order_number, customer id, slug, code…)
  primary: string;     // the main text that matched — the target for ranking + highlighting
  secondary?: string;  // supporting context (customer name, price, status…)
}

/** What the service asks a provider for. `resources` is already permission-filtered. */
export interface ProviderQuery {
  query: string;
  resources: SearchResource[];
  limitPerResource: number;
}

/** The contract every backend implements. Add an engine = implement this. */
export interface SearchProvider {
  readonly name: string;
  search(q: ProviderQuery): Promise<RawHit[]>;
}

// ── UI-facing shapes (produced by the SearchService, consumed by the admin) ──
export interface Highlight { pre: string; match: string; post: string }
export interface SearchHit { label: string; sublabel?: string; href: string; highlight?: Highlight }
export interface SearchResults {
  orders: SearchHit[];
  customers: SearchHit[];
  products: SearchHit[];
  coupons: SearchHit[];
  returns: SearchHit[];
  pages: SearchHit[];
}
