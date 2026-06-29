import type { Asset, AssetRef, ImageRole } from "@/platform/asset";
import { resolveAsset } from "@/platform/assetResolver";
import { planAssetRender } from "@/platform/assetRender";

/**
 * AssetImage (Atom, §8) — the one component every section uses for media.
 *
 * It is a thin RENDERER over the framework-agnostic render plan
 * (`planAssetRender`): the platform decides *what* to draw, this maps it to
 * React/HTML. A future native (or other-framework) renderer maps the same plan
 * — so AssetImage is not bound to `<img>`. Pure server component (no JS).
 * Principles: API before Interface; Assets before URLs; Performance before Decoration.
 */
interface AssetImageProps {
  asset: Asset | AssetRef | null | undefined;
  /** Overrides the asset's own alt. A decorative asset announces nothing. */
  alt?: string;
  role?: ImageRole;
  /** Hero imagery → eager + high fetch priority; everything else lazy-loads. */
  priority?: boolean;
  sizes?: string;
  /** "img" (default) or "background" for full-bleed cover surfaces. */
  as?: "img" | "background";
  className?: string;
}

export function AssetImage({
  asset,
  alt,
  role,
  priority,
  sizes,
  as = "img",
  className,
}: AssetImageProps) {
  const resolved: Asset | null =
    typeof asset === "string" ? resolveAsset(asset, { role, alt }) : asset ?? null;
  if (!resolved) return null;

  const plan = planAssetRender(resolved, { as, alt });
  const cls = ["asset-image", className].filter(Boolean).join(" ");
  const a11y = plan.decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": plan.alt } as const);

  switch (plan.kind) {
    case "gradient":
      return <div className={`${cls} ${plan.gradientClass ?? ""}`} {...a11y} />;

    case "background":
      return (
        <div
          className={cls}
          {...a11y}
          style={{
            backgroundImage: `url(${plan.src})`,
            backgroundPosition: plan.focalPosition,
            backgroundSize: "cover",
          }}
        />
      );

    case "video":
      return (
        <video
          className={cls}
          src={plan.src}
          poster={plan.posterSrc}
          muted
          loop
          playsInline
          autoPlay
          {...(plan.decorative
            ? { "aria-hidden": true }
            : { "aria-label": plan.alt })}
        />
      );

    case "image":
    default:
      return (
        // eslint-disable-next-line @next/next/no-img-element -- responsive Asset, not next/image
        <img
          className={cls}
          src={plan.src}
          srcSet={plan.srcSet}
          sizes={sizes}
          alt={plan.decorative ? "" : plan.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          style={{
            objectPosition: plan.focalPosition,
            // blur-up LQIP with no JS — the image paints over its own blur background
            backgroundImage: plan.blur ? `url(${plan.blur})` : undefined,
            backgroundSize: plan.blur ? "cover" : undefined,
          }}
        />
      );
  }
}
