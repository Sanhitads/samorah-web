/**
 * Asset / Media Library (§11) — images are never raw URLs.
 *
 * Responsibility: the first-class media record — responsive sources, editorial
 * role, focal point, rights and mood — that every image/video reference resolves
 * to. Principle: Assets before URLs.
 *
 * Designed-for (not yet managed): registry lifecycle (`status`/`version` —
 * draft → published → archived → versioned), Cloudinary-generated `variants[]`
 * (replacing desktop/tablet/mobile over time) with automatic AVIF/WebP/JPEG
 * negotiation, and Asset Usage (which pages/products/campaigns reference an
 * asset — see `AssetUsage`).
 */
import type { LifecycleStatus } from "./primitives";
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

/** Media kind — images today; the union is intentionally broad. */
export type AssetKind = "image" | "video" | "animation" | "audio" | "document";

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

/** A generated source (Cloudinary later). The future `variants[]` supersedes the
 *  fixed desktop/tablet/mobile trio while keeping today's API working. */
export interface AssetVariant {
  name: "thumbnail" | "small" | "medium" | "large" | "original" | (string & {});
  url: string;
  width?: number;
  height?: number;
  format?: "avif" | "webp" | "jpeg" | "png" | (string & {});
}

export interface Asset {
  id: string;
  kind: AssetKind;

  // — responsive sources (→ Cloudinary). `variants[]` is preferred when present. —
  desktop: string;
  tablet?: string;
  mobile?: string;
  variants?: AssetVariant[];
  poster?: string; // video
  thumbnail?: string;
  blurPlaceholder?: string; // LQIP data URI
  blurHash?: string; // compact blur hash

  // — composition —
  role: ImageRole;
  focalPoint?: FocalPoint;
  dominantColor?: string;
  aspectRatio?: string; // "4 / 5" — helps prevent CLS
  /** When true, the renderer treats it as decorative (no alt announced) — the
   *  renderer never guesses. */
  decorative?: boolean;

  // — editorial / rights —
  alt: string; // required (ignored when decorative)
  photographer?: string;
  location?: string;
  season?: string;
  campaign?: string;
  editorialMood?: EditorialMood;
  taxonomy?: TaxonomyRef[];
  license?: AssetLicense;

  // — registry lifecycle (designed-for; managed by the Media Library later) —
  status?: LifecycleStatus;
  version?: number;
}

/**
 * A reference to an `Asset` by id (or an alias). Gradient placeholders
 * ("gradient:grad-chai") resolve to placeholder Assets, so swapping to Cloudinary
 * is a data change, not a code change.
 */
export type AssetRef = string;

/**
 * Where an Asset is referenced — so the CMS can warn before edit/delete
 * ("deleting this affects: Homepage Hero · Volume II · a Journal Story").
 * Derived from the relationship graph (edges whose `toType` is "asset"); this is
 * the shape such a query returns. [Future — CMS]
 */
export interface AssetUsage {
  assetId: string;
  usedBy: { type: string; id: string; context?: string }[];
}
