/**
 * schema.org/Product + Offer JSON-LD for the PDP (SEO rich results — audit gap:
 * the PDP had generateMetadata but no structured data, so no price/availability
 * rich snippet). Pure — takes the resolved product view + canonical URL.
 */
import { COMMERCE } from "@/config/commerce";
import { productionOrigin } from "@/config/site";

interface LdInput {
  name: string;
  slug: string;
  description?: string | null;
  gallery: { src: string }[];
  priceLabel: string;
  variants: { price: number; inStock: boolean }[];
  price?: number | null;
}

const abs = (src: string) => (src.startsWith("http") ? src : `${productionOrigin()}${src.startsWith("/") ? "" : "/"}${src}`);

export function productLd(p: LdInput): Record<string, unknown> {
  const prices = p.variants.map((v) => v.price).filter((n) => n > 0);
  const anyInStock = p.variants.length ? p.variants.some((v) => v.inStock) : true;
  const availability = anyInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const images = p.gallery.map((g) => g.src).filter((s) => s && !s.startsWith("gradient")).map(abs).slice(0, 4);
  const url = `${productionOrigin()}/shop/${p.slug}`;

  const offers =
    prices.length > 1
      ? {
          "@type": "AggregateOffer",
          priceCurrency: COMMERCE.currency,
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
          availability,
          url,
        }
      : {
          "@type": "Offer",
          priceCurrency: COMMERCE.currency,
          price: prices[0] ?? p.price ?? 0,
          availability,
          url,
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? p.name,
    ...(images.length ? { image: images } : {}),
    brand: { "@type": "Brand", name: COMMERCE.brandName },
    offers,
  };
}

/** Product + Offer JSON-LD for an Air/Room/Linen product, from its canonical Hours data — the SAME
 *  builder as candles (no separate air schema engine). Gradient placeholder images are dropped by
 *  productLd; a single price yields a single Offer with InStock availability. */
export function airProductLd(hour: { name: string; productSlug: string; price: number; priceLabel: string; cardImage?: string }, description?: string | null): Record<string, unknown> {
  return productLd({
    name: hour.name,
    slug: hour.productSlug,
    description: description ?? null,
    gallery: hour.cardImage ? [{ src: hour.cardImage }] : [],
    priceLabel: hour.priceLabel,
    variants: hour.price > 0 ? [{ price: hour.price, inStock: true }] : [],
    price: hour.price,
  });
}
