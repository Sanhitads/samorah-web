import productsData from "@/data/products.json";

/**
 * Interim catalogue search.
 *
 * Filters the seed catalogue client-side — enough for the launch catalogue and
 * a faithful port of the prototype's search. The Search Overlay depends only on
 * `searchProducts(query)`, so this is swappable for server-side Postgres
 * full-text (BRD P1) behind the same signature, with no UI change.
 */

interface SeedProduct {
  slug: string;
  name: string;
  chapterName: string;
  tagline: string;
  scentGroup: string;
  price: number;
  moodTags?: string[];
  fragranceNotes: { top: string[]; heart: string[]; base: string[] };
  gradClass: string;
}

const PRODUCTS = productsData as unknown as SeedProduct[];

export interface SearchResult {
  slug: string;
  name: string;
  chapterName: string;
  /** A short "top · top · heart" notes line. */
  notes: string;
  tags: string[];
  price: number;
  gradClass: string;
}

function toResult(p: SeedProduct): SearchResult {
  return {
    slug: p.slug,
    name: p.name,
    chapterName: p.chapterName,
    notes: [...p.fragranceNotes.top.slice(0, 2), ...p.fragranceNotes.heart.slice(0, 1)].join(" · "),
    tags: p.moodTags ?? [],
    price: p.price,
    gradClass: p.gradClass,
  };
}

/** Case-insensitive match across name, tagline, scent group, chapter, notes, moods. */
export function searchProducts(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PRODUCTS.filter((p) => {
    const haystack = [
      p.name,
      p.tagline,
      p.scentGroup,
      p.chapterName,
      ...(p.moodTags ?? []),
      ...p.fragranceNotes.top,
      ...p.fragranceNotes.heart,
      ...p.fragranceNotes.base,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }).map(toResult);
}

/** Curated quick-search chips shown before the customer types (all return hits). */
export const SEARCH_SUGGESTIONS = [
  "Chai",
  "Dessert",
  "Gourmand",
  "Rose",
  "Sandalwood",
] as const;
