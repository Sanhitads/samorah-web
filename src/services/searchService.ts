/**
 * Public entry for global admin search. The implementation is layered under
 * `./search/` — SearchService (this re-export) → SearchProvider → engine impl.
 * See `search/types.ts` for the architecture. Kept here so `@/services/searchService`
 * stays the stable import path for the admin.
 */
export { globalSearch, getSearchProvider } from "./search/service";
export type { SearchHit, SearchResults, SearchResource, SearchOpts } from "./search/service";
