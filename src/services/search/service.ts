/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SearchService — the layer the admin calls. Owns everything that ISN'T raw
 * retrieval: permissions, ranking, highlighting, grouping, pagination, and
 * analytics/logging. It asks a SearchProvider for matches and shapes them for the
 * UI. Providers stay dumb; this is where policy and presentation live.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ilikeProvider } from "./ilikeProvider";
import type { SearchProvider, SearchResource, RawHit, SearchResults, SearchHit, Highlight } from "./types";

export type { SearchHit, SearchResults, SearchResource } from "./types";

export interface SearchOpts {
  pii: boolean;              // caller holds analytics.view → may see orders/customers
  perGroup?: number;         // pagination — hits per resource group
  actorId?: string;          // for analytics (who searched)
  sessionId?: string;
}

// ── Provider registry (engine swap = add here + flip SEARCH_PROVIDER) ──
const PROVIDERS: Record<string, SearchProvider> = { ilike: ilikeProvider };
export function getSearchProvider(): SearchProvider {
  return PROVIDERS[process.env.SEARCH_PROVIDER ?? "ilike"] ?? ilikeProvider;
}

// ── 1. Permissions — which resources this caller may search ──
const PII_RESOURCES: SearchResource[] = ["orders", "customers"];
const PUBLIC_RESOURCES: SearchResource[] = ["products", "coupons", "returns", "pages", "media"];
function allowedResources(pii: boolean): SearchResource[] {
  return pii ? [...PII_RESOURCES, ...PUBLIC_RESOURCES] : PUBLIC_RESOURCES;
}

// ── 3. Ranking — relevance of a match on its primary text ──
function score(primary: string, q: string): number {
  const p = primary.toLowerCase(); const needle = q.toLowerCase();
  const i = p.indexOf(needle);
  if (i < 0) return 0;
  if (p === needle) return 100;               // exact
  if (i === 0) return 80;                      // prefix
  if (/\s|[-_/]/.test(p[i - 1] ?? "")) return 60; // word boundary
  return 40;                                   // substring
}

// ── 4. Highlighting — split primary around the match for <mark> rendering ──
function highlight(primary: string, q: string): Highlight | undefined {
  const i = primary.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return undefined;
  return { pre: primary.slice(0, i), match: primary.slice(i, i + q.length), post: primary.slice(i + q.length) };
}

// Resource → admin URL for the ref the provider returned.
const HREF: Record<SearchResource, (ref: string) => string> = {
  orders: (r) => `/admin/orders/${r}`,
  customers: (r) => `/admin/customers/${r}`,
  products: () => `/admin/products`,
  coupons: () => `/admin/coupons`,
  returns: () => `/admin/returns`,
  pages: () => `/admin/content`,
  media: () => `/admin/media`,
};

const emptyResults = (): SearchResults => ({ orders: [], customers: [], products: [], coupons: [], returns: [], pages: [], media: [] });

/** The facade the admin calls. Retrieval delegated to the provider; everything else here. */
export async function globalSearch(query: string, opts: SearchOpts = { pii: false }): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptyResults();
  const perGroup = opts.perGroup ?? 6;

  // 1. permissions → resources the provider is even allowed to touch
  const resources = allowedResources(opts.pii);

  // 2. retrieve (dumb provider)
  const raw = await getSearchProvider().search({ query: q, resources, limitPerResource: perGroup * 2 });

  // 3/4/5/6. rank → highlight → group → paginate
  const results = emptyResults();
  const scored = raw
    .map((h: RawHit) => ({ h, s: score(h.primary, q) }))
    .sort((a, b) => b.s - a.s);
  for (const { h } of scored) {
    const group = results[h.resource];
    if (group.length >= perGroup) continue; // pagination: per-group cap
    group.push({ label: h.primary, sublabel: h.secondary, href: HREF[h.resource](h.ref), highlight: highlight(h.primary, q) });
  }

  // 7. analytics / logging — record the search (non-blocking).
  const total = Object.values(results).reduce((a, b) => a + b.length, 0);
  void logSearch(q, total, opts);

  return results;
}

/** Analytics — persist to search_logs so we learn what admins look for. Never throws. */
async function logSearch(query: string, resultsCount: number, opts: SearchOpts): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db.from("search_logs").insert({
      query, results_count: resultsCount, user_id: opts.actorId ?? null, session_id: opts.sessionId ?? null,
    });
  } catch (e) {
    console.error("logSearch failed (non-fatal)", e);
  }
}
