/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Global admin search (R1) — one query across every resource, like a commercial
 * admin's top search bar. Returns grouped, linked hits. PII groups (orders/
 * customers) are only populated when the caller holds analytics.view.
 *
 * ── Swappable backend ────────────────────────────────────────────────────────
 * The UI depends ONLY on `globalSearch()` + the `SearchResults`/`SearchHit` shape
 * — never on how results are fetched. The actual fetch lives behind a
 * `SearchProvider` interface, selected by the `SEARCH_PROVIDER` env var. Today the
 * only provider is ILIKE-over-Postgres; moving to PG full-text or Meilisearch/
 * OpenSearch is a NEW provider object implementing the same interface + flipping
 * the env var — zero changes to the page, the search box, or the result contract.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { listPagesAdmin } from "@/services/cmsService";

export interface SearchHit { label: string; sublabel?: string; href: string }
export interface SearchResults {
  orders: SearchHit[];
  customers: SearchHit[];
  products: SearchHit[];
  coupons: SearchHit[];
  returns: SearchHit[];
  pages: SearchHit[];
}
export interface SearchOpts { pii: boolean }

/** The contract any backend must satisfy. Add a provider = implement this. */
export interface SearchProvider {
  readonly name: string;
  search(query: string, opts: SearchOpts): Promise<SearchResults>;
}

const emptyResults = (): SearchResults => ({ orders: [], customers: [], products: [], coupons: [], returns: [], pages: [] });

/**
 * Provider 1 — ILIKE over Postgres (Supabase). Good to a few thousand rows; the
 * default. A PG-FTS or Meilisearch provider would implement the same `search()`
 * and return the same shape (map the engine's hits into SearchHit groups).
 */
const ilikeProvider: SearchProvider = {
  name: "ilike",
  async search(query: string, opts: SearchOpts): Promise<SearchResults> {
    const q = query.trim().replace(/[%,]/g, "");
    if (!q) return emptyResults();
    const db = createAdminClient() as any;
    const like = `%${q}%`;

    const [ordersR, customersR, productsR, couponsR, returnsR, pages] = await Promise.all([
      opts.pii ? db.from("orders").select("order_number,email,ship_full_name,total_amount").or(`order_number.ilike.${like},email.ilike.${like},ship_full_name.ilike.${like}`).limit(6) : Promise.resolve({ data: [] }),
      opts.pii ? db.from("users").select("id,email,full_name").eq("role", "customer").or(`email.ilike.${like},full_name.ilike.${like},phone.ilike.${like}`).limit(6) : Promise.resolve({ data: [] }),
      db.from("products").select("slug,name,base_sku").or(`name.ilike.${like},base_sku.ilike.${like},slug.ilike.${like}`).limit(6),
      db.from("coupons").select("id,code,description").ilike("code", like).limit(6),
      db.from("returns").select("rma_number,order_number,status").or(`rma_number.ilike.${like},order_number.ilike.${like}`).limit(6),
      listPagesAdmin(),
    ]);

    return {
      orders: (ordersR.data ?? []).map((o: any) => ({ label: o.order_number, sublabel: `${o.ship_full_name ?? o.email} · ₹${Number(o.total_amount).toLocaleString("en-IN")}`, href: `/admin/orders/${o.order_number}` })),
      customers: (customersR.data ?? []).map((c: any) => ({ label: c.full_name ?? c.email, sublabel: c.email, href: `/admin/customers/${c.id}` })),
      products: (productsR.data ?? []).map((p: any) => ({ label: p.name, sublabel: p.base_sku, href: `/admin/products` })),
      coupons: (couponsR.data ?? []).map((c: any) => ({ label: c.code, sublabel: c.description ?? "", href: `/admin/coupons` })),
      returns: (returnsR.data ?? []).map((r: any) => ({ label: r.rma_number, sublabel: `${r.order_number} · ${r.status}`, href: `/admin/returns` })),
      pages: (pages ?? []).filter((p) => p.slug.includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6).map((p) => ({ label: p.title, sublabel: `/${p.slug}`, href: `/admin/content` })),
    };
  },
};

// Registry — add future providers here (e.g. meiliProvider, pgFtsProvider).
const PROVIDERS: Record<string, SearchProvider> = { ilike: ilikeProvider };

/** Resolve the active provider from env, falling back to ILIKE. */
export function getSearchProvider(): SearchProvider {
  return PROVIDERS[process.env.SEARCH_PROVIDER ?? "ilike"] ?? ilikeProvider;
}

/** Stable facade the UI calls — delegates to whichever provider is active. */
export async function globalSearch(query: string, opts: SearchOpts = { pii: false }): Promise<SearchResults> {
  return getSearchProvider().search(query, opts);
}
