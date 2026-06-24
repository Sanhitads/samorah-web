// Collection domain — pure functions over collection (chapter) rows. Samorah's
// catalog is organised as numbered "chapters" (Vol. I, Vol. II, …); these
// helpers own that hierarchy/ordering so services and UI don't reinvent it.

export interface CollectionLike {
  name: string;
  slug: string;
  volume: string | null;
  is_coming_soon: boolean;
  sort_order?: number | null;
}

/** Chapters in curated order (sort_order asc; stable for ties). */
export function orderCollections<T extends CollectionLike>(collections: T[]): T[] {
  return [...collections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Live chapters (not coming-soon), ordered. */
export function liveCollections<T extends CollectionLike>(collections: T[]): T[] {
  return orderCollections(collections).filter((c) => !c.is_coming_soon);
}

/** Coming-soon chapters, ordered (e.g. Vol. IV teaser). */
export function comingSoonCollections<T extends CollectionLike>(collections: T[]): T[] {
  return orderCollections(collections).filter((c) => c.is_coming_soon);
}

/** Short chapter label: the volume ("Vol. I") if present, else the name. */
export function chapterLabel(c: CollectionLike): string {
  return c.volume ?? c.name;
}

/** Full chapter title: "Vol. I — Dessert Chapter" (name only when no volume). */
export function chapterTitle(c: CollectionLike): string {
  return c.volume ? `${c.volume} — ${c.name}` : c.name;
}

/** Whether a chapter is browsable (live, with a route). */
export function isBrowsable(c: CollectionLike): boolean {
  return !c.is_coming_soon;
}
