/**
 * Asset / Media Library (§11) — images are never raw URLs.
 *
 * Responsibility: the first-class media record — responsive sources, editorial
 * role, focal point, rights and mood — that every image/video reference resolves
 * to. Principle: Assets before URLs.
 */
import type { EditorialMood } from "./primitives";
import type { TaxonomyRef } from "./taxonomy";

/** Editorial role of an image — makes galleries intelligent. */
export type ImageRole =
  | "hero"
  | "support"
  | "detail"
  | "portrait"
  | "lifestyle"
  | "architecture"
  | "texture"
  | "people"
  | "macro"
  | "transition"
  | "background";

/** Normalised 0–1 — the crop never loses the subject. */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface AssetLicense {
  holder: string;
  expiresAt?: string | null;
  usage?: string;
}

export interface Asset {
  id: string;
  kind: "image" | "video";

  // — responsive sources (→ Cloudinary) —
  desktop: string;
  tablet?: string;
  mobile?: string;
  poster?: string; // video
  thumbnail?: string;
  blurPlaceholder?: string; // LQIP

  // — composition —
  role: ImageRole;
  focalPoint?: FocalPoint;
  dominantColor?: string;
  aspectRatio?: string; // "4 / 5"

  // — editorial / rights —
  alt: string; // required
  photographer?: string;
  location?: string;
  season?: string;
  campaign?: string;
  editorialMood?: EditorialMood;
  taxonomy?: TaxonomyRef[];
  license?: AssetLicense;
}

/**
 * A reference to an `Asset` by id. Gradient placeholders ("gradient:grad-chai")
 * resolve to placeholder Assets, so swapping to Cloudinary is a data change, not
 * a code change.
 */
export type AssetRef = string;
