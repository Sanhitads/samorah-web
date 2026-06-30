/**
 * Presentation contracts — UI-agnostic types describing HOW a component presents
 * (variant · state · media · aspect · overlay · a11y · CTA · capabilities). They
 * live in lib (not components) so the page builder can emit them and the
 * components can consume them without a backwards dependency. Most fields are
 * reserved for the CMS; defaults reproduce today's behaviour.
 */

/** Photography shape — luxury brands re-shoot constantly; ratio is data. */
export type AspectRatio = "portrait" | "square" | "landscape" | "cinematic";

/** Media kind — only "image" renders today; video/cinemagraph/3d are reserved
 *  so the component contract never has to change to gain them. */
export type MediaKind = "image" | "video" | "cinemagraph" | "3d";
export interface MediaContent {
  kind: MediaKind;
  src: string; // url or `gradient:*` (an AssetRef)
  alt?: string;
  poster?: string; // video / cinemagraph still
  aspect?: AspectRatio;
}

/** Explicit component states (CMS + runtime), so every component behaves alike. */
export type ComponentState =
  | "ready"
  | "loading"
  | "empty"
  | "unavailable"
  | "hidden"
  | "coming-soon"
  | "disabled";

/** How a hero/media surface treats its overlay. */
export type OverlayStyle = "gradient" | "blur" | "glass" | "solid" | "none";

/** Rail presentation — one component, many layouts (like Section variants). */
export type RailLayout = "editorial" | "magazine" | "timeline" | "cards" | "stack";

/** Accessibility metadata carried by a component contract. */
export interface A11yMeta {
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  landmark?: "region" | "group" | "list" | "none";
  ariaLabel?: string;
}

/** A call to action — label (and target) come from data, never hardcoded. */
export interface CtaAction {
  label: string;
  href?: string;
}

/** ProductCard presentation variants — one card, every context. */
export type ProductCardVariant =
  | "editorial"
  | "shop"
  | "related"
  | "bundle"
  | "recommendation"
  | "search"
  | "wishlist"
  | "collection";

/** Optional ProductCard capabilities — functionality grows by config, not new
 *  components. Defaults: badge + price + hover on; the rest off (reserved). */
export interface ProductCardCapabilities {
  badge?: boolean;
  price?: boolean;
  wishlist?: boolean;
  quickView?: boolean;
  hoverMedia?: boolean;
  video?: boolean;
  story?: boolean;
}

export const DEFAULT_CARD_CAPABILITIES: Required<ProductCardCapabilities> = {
  badge: true,
  price: true,
  hoverMedia: true,
  wishlist: false,
  quickView: false,
  video: false,
  story: false,
};

/** Wrap a still image (url or gradient ref) as MediaContent. */
export function imageMedia(src: string, alt?: string, aspect: AspectRatio = "portrait"): MediaContent {
  return { kind: "image", src, alt, aspect };
}
