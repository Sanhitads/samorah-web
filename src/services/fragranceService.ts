import fragrancesData from "@/data/fragrances.json";

export interface FragranceFamily {
  id: string;
  name: string;
  tagline: string;
  notes: { opening: string[]; heart: string[]; base: string[] };
  inspiredBy: string;
  gradClass: string;
}

/**
 * Fragrance families for the Scent Experience section and filters. Sourced from
 * the curated src/data/fragrances.json reference — kept lightweight (no
 * fragrance_families table) per the "avoid over-normalization" guidance. The
 * product-level `scent_group` / `fragrance_family` columns link products to these.
 */
export function getFragranceFamilies(): FragranceFamily[] {
  return fragrancesData as FragranceFamily[];
}

export function getFragranceFamilyById(id: string): FragranceFamily | undefined {
  return getFragranceFamilies().find((family) => family.id === id);
}
