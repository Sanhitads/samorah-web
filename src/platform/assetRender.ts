/**
 * Asset render plan (§11) — the renderer-agnostic model of "what to draw".
 *
 * Responsibility: turn an `Asset` into a presentation-neutral plan (a gradient,
 * an image with sources, a background, a video…). Any renderer — React/HTML
 * today, native or another framework later — maps this plan to its own output.
 * Framework-agnostic. Principle: API before Interface (the platform decides the
 * plan; the interface only renders it).
 */
import type { Asset } from "./asset";
import { isGradientRef, gradientClassOf } from "./assetResolver";
import { isCloudinary, cldUrl, cldSrcSet } from "@/lib/cloudinaryUrl";

export type AssetRenderKind =
  | "gradient"
  | "image"
  | "background"
  | "video"
  | "none";

export interface AssetRenderPlan {
  kind: AssetRenderKind;
  gradientClass?: string; // kind = "gradient"
  src?: string; // primary source
  srcSet?: string; // responsive candidates
  posterSrc?: string; // video poster
  focalPosition?: string; // "50% 50%"
  blur?: string; // LQIP source
  aspectRatio?: string; // "4 / 5" (CLS)
  decorative: boolean; // the renderer never guesses a11y
  alt: string;
}

/** Build the responsive candidate set — prefer Cloudinary `variants[]`, else the
 *  fixed desktop/tablet/mobile trio. */
function buildSrcSet(asset: Asset): string | undefined {
  if (asset.variants?.length) {
    const out = asset.variants
      .filter((v) => v.width)
      .map((v) => `${v.url} ${v.width}w`)
      .join(", ");
    if (out) return out;
  }
  // A single Cloudinary upload → generate the responsive candidates on the fly (f_auto,q_auto,w_n),
  // so a phone downloads a phone-sized modern-format image, not the full desktop original.
  if (isCloudinary(asset.desktop) && !asset.mobile && !asset.tablet) {
    return cldSrcSet(asset.desktop);
  }
  const out = [
    asset.mobile && `${asset.mobile} 640w`,
    asset.tablet && `${asset.tablet} 1024w`,
    `${asset.desktop} 1600w`,
  ]
    .filter(Boolean)
    .join(", ");
  return out || undefined;
}

export function planAssetRender(
  asset: Asset,
  opts?: { as?: "img" | "background"; alt?: string },
): AssetRenderPlan {
  const alt = opts?.alt ?? asset.alt;
  const decorative = asset.decorative ?? !alt;
  const focalPosition = asset.focalPoint
    ? `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`
    : undefined;
  const base = {
    decorative,
    alt,
    focalPosition,
    aspectRatio: asset.aspectRatio,
    blur: asset.blurPlaceholder,
  };

  if (isGradientRef(asset.desktop)) {
    return {
      ...base,
      kind: "gradient",
      gradientClass: gradientClassOf(asset.desktop) ?? undefined,
    };
  }
  if (asset.kind === "video") {
    return { ...base, kind: "video", src: asset.desktop, posterSrc: asset.poster };
  }
  if (opts?.as === "background") {
    // Backgrounds have no srcSet — serve a format-optimised, generously capped single image.
    return { ...base, kind: "background", src: isCloudinary(asset.desktop) ? cldUrl(asset.desktop, 2048) : asset.desktop };
  }
  // The `src` fallback (no-srcSet browsers) is format-optimised + capped; srcSet carries the widths.
  const src = isCloudinary(asset.desktop) ? cldUrl(asset.desktop, 1600) : asset.desktop;
  return { ...base, kind: "image", src, srcSet: buildSrcSet(asset) };
}
