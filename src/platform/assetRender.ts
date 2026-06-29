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
    return { ...base, kind: "background", src: asset.desktop };
  }
  return { ...base, kind: "image", src: asset.desktop, srcSet: buildSrcSet(asset) };
}
