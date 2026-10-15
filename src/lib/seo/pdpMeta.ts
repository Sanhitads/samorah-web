import type { Metadata } from "next";

/**
 * Base PDP metadata (title / description / canonical / Open Graph / Twitter) built from a product's
 * resolved view + its CMS SEO fields. ARCHIVED and ACTIVE products share THIS EXACT path — the route's
 * generateMetadata has no archived branch, so a retired PDP gets the same social-metadata hierarchy as a
 * live one:
 *   title       = CMS seo_title (complete, marked absolute later) → product name (template brands once)
 *   description = CMS seo_description → product tagline → generated sentence
 *   canonical   = CMS seo_canonical (stale /products values are dropped upstream) → /shop/[slug]
 *   OG/Twitter  = CMS seo_og_image → the product's own first REAL gallery image (gradients excluded)
 *                 → (site default OG image, layered on afterwards by withRouteSeo) — never a broken URL.
 * Pure + unit-testable; the route wraps the result with withRouteSeo (override + site-default layering).
 */
export interface PdpSeoFields {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}
export interface PdpMetaView {
  name: string;
  tagline: string | null;
  gallery: { src: string }[];
}

export function pdpMetaBase(slug: string, view: PdpMetaView, seo: PdpSeoFields): Metadata {
  const metaTitle = seo.title || view.name; // explicit (branded) → absolute via finalizeTitle; bare name → template appends "| Samorah"
  const ogTitle = seo.title || `${view.name} · Samorah`; // social title always carries the brand
  const description = seo.description || view.tagline || `${view.name} — a Samorah scented candle.`;
  const canonical = seo.canonical || `/shop/${slug}`;
  const ogImage = seo.ogImage || view.gallery.find((g) => g.src && !g.src.startsWith("gradient"))?.src;
  const ogImages = ogImage ? { images: [ogImage] } : {};
  return {
    title: metaTitle,
    description,
    alternates: { canonical },
    openGraph: { title: ogTitle, description, type: "website", url: `/shop/${slug}`, ...ogImages },
    twitter: { card: "summary_large_image", title: ogTitle, description, ...ogImages },
  };
}
