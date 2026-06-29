/**
 * Editorial content (§12, §19) — the Editorial World content type and SEO.
 *
 * Responsibility: hold reusable editorial content (the Editorial World that
 * powers every gallery) and per-page SEO metadata. Principles: Editorial before
 * Commerce; Content before Components.
 */
import type { EditorialMood, ThemeToken } from "./primitives";
import type { AssetRef } from "./asset";
import type { TaxonomyRef } from "./taxonomy";

// — SEO engine (§19): one model per page. —
export interface SeoMeta {
  title: string;
  description: string;
  keywords?: string[];
  canonical?: string;
  ogImage?: AssetRef;
  twitterCard?: "summary" | "summary_large_image";
  structuredData?: unknown; // JSON-LD (Product / Collection / Article)
}

// — Editorial World (§12): a reusable content type powering all galleries. —
export type EditorialRole =
  | "Opening"
  | "Ritual"
  | "Detail"
  | "Still Life"
  | "Closing";

/**
 * The canonical platform story. (The homepage's `config/editorialWorld.ts`
 * `EditorialStory` is the v1 seed; it graduates raw `image` → `asset: AssetRef`
 * when content migrates onto these models.)
 */
export interface EditorialStory {
  id: string;
  title: string;
  caption?: string;
  story?: string;
  role: EditorialRole; // narrative slot — drives composition
  asset: AssetRef;
  destinationUrl?: string;
  productSlugs?: string[]; // products living inside the story
  location?: string;
  editorialMood?: EditorialMood;
  taxonomy?: TaxonomyRef[];
  seoDescription?: string;
  displayOrder: number;
}

export interface EditorialWorld {
  id: string;
  title: string;
  campaignId?: string;
  editorialMood?: EditorialMood;
  themeToken?: ThemeToken;
  taxonomy?: TaxonomyRef[];
  stories: EditorialStory[];
}
