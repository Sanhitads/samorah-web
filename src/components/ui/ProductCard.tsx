import Link from "next/link";
import type { JSX } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import type { ProductCommerceProjection } from "@/platform/commerce";
import {
  DEFAULT_CARD_CAPABILITIES,
  type A11yMeta,
  type ComponentState,
  type CtaAction,
  type MediaContent,
  type ProductCardCapabilities,
  type ProductCardVariant,
} from "@/lib/presentation";

/**
 * ProductCard (Atom) — the ONE product card, presented through configuration
 * rather than copied into new components. A `variant` (editorial · shop ·
 * related · bundle · recommendation · search · wishlist · collection), explicit
 * `state`, declared `capabilities`, data-driven `media` + aspect ratio, a CTA
 * from data, and a11y metadata. Reads only the commerce PROJECTION (§14).
 * Server component. Defaults reproduce the editorial card's original look.
 */
export interface ProductCardModel {
  slug: string;
  name: string;
  tagline?: string | null;
  media: MediaContent;
  commerce: Pick<ProductCommerceProjection, "priceRange" | "badge">;
  /** Chapter numbering — "VOL. I.2" — shown above the name (editorial variant). */
  edition?: string;
  /** "Core Collection" | "Limited Collection" | … shown under the name. */
  collectionType?: string;
  /** Product-type label ("Room Spray" / "Linen Spray") — used where a mixed
   *  listing needs the category (e.g. Air products on the Shop grid). */
  productTypeLabel?: string;
  /** Editorial price label ("From ₹899"); falls back to the projection display. */
  priceLabel?: string;
  /** The action label/target — from settings, not hardcoded. */
  cta?: CtaAction;
  /** Optional editorial story link (capability `story`). */
  storyHref?: string;
}

const BADGE_LABEL: Record<NonNullable<ProductCommerceProjection["badge"]>, string> = {
  sold_out: "Sold out",
  sale: "Sale",
  hero: "Signature",
  bestseller: "Loved",
  low_stock: "Low stock",
};

export function ProductCard({
  product,
  variant = "editorial",
  state = "ready",
  capabilities,
  a11y,
  priority,
}: {
  product: ProductCardModel;
  variant?: ProductCardVariant;
  state?: ComponentState;
  capabilities?: ProductCardCapabilities;
  a11y?: A11yMeta;
  priority?: boolean;
}) {
  if (state === "hidden") return null;

  const caps = { ...DEFAULT_CARD_CAPABILITIES, ...capabilities };
  const { slug, name, tagline, media, commerce, cta, edition, collectionType, productTypeLabel, priceLabel } = product;
  const aspect = media.aspect ?? "portrait";
  const level = a11y?.headingLevel ?? 3;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;
  const href = cta?.href ?? `/shop/${slug}`;
  // A card is interactive only when ready; other states render inert.
  const interactive = state === "ready";
  const label = a11y?.ariaLabel ?? name;
  const stateLabel =
    state === "coming-soon" ? "Coming soon" : state === "unavailable" ? "Unavailable" : null;

  const inner = (
    <>
      {/* div (not span) — it holds the AssetImage <div>; a <div> in a <span>
          is invalid DOM nesting (a React hydration warning). */}
      <div className="product-card__media">
        {state === "loading" ? (
          <span className="product-card__skeleton" aria-hidden="true" />
        ) : (
          <AssetImage
            asset={media.src}
            alt={media.alt ?? name}
            role="lifestyle"
            priority={priority}
            sizes="(max-width: 640px) 50vw, 320px"
            className="product-card__image"
          />
        )}
        {caps.badge && commerce.badge ? (
          <span className="product-card__badge">{BADGE_LABEL[commerce.badge]}</span>
        ) : null}
        {stateLabel ? <span className="product-card__state">{stateLabel}</span> : null}
      </div>

      {state === "loading" ? null : (
        <div className="product-card__body">
          {edition ? <span className="product-card__edition">{edition}</span> : null}
          <Heading className="product-card__name">{name}</Heading>
          {tagline ? <p className="product-card__tagline">{tagline}</p> : null}
          {collectionType ? <span className="product-card__collection">{collectionType}</span> : null}
          {productTypeLabel ? <span className="product-card__type">{productTypeLabel}</span> : null}
          {caps.price ? (
            <span className="product-card__price">{priceLabel ?? commerce.priceRange.display}</span>
          ) : null}
          {cta?.label ? <span className="product-card__cta">{cta.label}</span> : null}
        </div>
      )}
    </>
  );

  const common = {
    className: "product-card",
    "data-variant": variant,
    "data-aspect": aspect,
    "data-state": state,
  } as const;

  if (!interactive) {
    return (
      <div {...common} aria-label={label} aria-disabled>
        {inner}
      </div>
    );
  }
  return (
    <Link {...common} href={href} aria-label={label}>
      {inner}
    </Link>
  );
}
