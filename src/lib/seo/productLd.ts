/**
 * schema.org/Product + Offer JSON-LD for the PDP (SEO rich results). Pure — takes the resolved product
 * view + canonical URL. Truthfulness rules: an Offer is emitted ONLY when a real positive price exists
 * (never price:0); availability defaults to OutOfStock when nothing is sellable (never a fabricated
 * InStock); an archived product (discontinued:true) emits NO Offer at all — the retired PDP shows no price
 * or purchase path, so there is no truthful commercial offer to represent. Brand uses the single canonical
 * casing (SITE_CONFIG.brandName = "Samorah"); SKU is rendered only when a real, non-blank value exists.
 */
import { COMMERCE } from "@/config/commerce";
import { productionOrigin, SITE_CONFIG } from "@/config/site";

interface LdInput {
  name: string;
  slug: string;
  description?: string | null;
  gallery: { src: string }[];
  priceLabel: string;
  variants: { price: number; inStock: boolean }[];
  price?: number | null;
  /** A single canonical SKU (base SKU) when one is meaningful. */
  sku?: string | null;
  /** Archived/retired product — reports availability Discontinued and never InStock or a purchasable Offer. */
  discontinued?: boolean;
}

const NEW_CONDITION = "https://schema.org/NewCondition";
const abs = (src: string) => (src.startsWith("http") ? src : `${productionOrigin()}${src.startsWith("/") ? "" : "/"}${src}`);

export function productLd(p: LdInput): Record<string, unknown> {
  const prices = p.variants.map((v) => v.price).filter((n) => n > 0);
  const basePrice = p.price && p.price > 0 ? p.price : undefined;
  // Default to NOT in stock when there is nothing sellable — never fabricate InStock.
  const anyInStock = p.variants.length ? p.variants.some((v) => v.inStock) : false;
  const images = p.gallery.map((g) => g.src).filter((s) => s && !s.startsWith("gradient")).map(abs).slice(0, 4);
  const url = `${productionOrigin()}/shop/${p.slug}`;
  // Render a SKU unchanged when a real one exists; omit it for null / undefined / empty / whitespace.
  const sku = typeof p.sku === "string" && p.sku.trim() ? p.sku : undefined;

  // An archived/discontinued product shows NO price and NO purchase path on the page, so it emits NO Offer
  // at all (never InStock, never a price, no invented/historical figure). Active products emit a truthful
  // Offer ONLY when a real positive price exists (unpriced/coming-soon → no Offer, never ₹0).
  let offers: Record<string, unknown> | undefined;
  if (!p.discontinued) {
    const availability = anyInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
    if (prices.length > 1) {
      offers = { "@type": "AggregateOffer", priceCurrency: COMMERCE.currency, lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length, availability, itemCondition: NEW_CONDITION, url };
    } else if (prices.length === 1 || basePrice !== undefined) {
      offers = { "@type": "Offer", priceCurrency: COMMERCE.currency, price: prices[0] ?? basePrice, availability, itemCondition: NEW_CONDITION, url };
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? p.name,
    ...(images.length ? { image: images } : {}),
    ...(sku ? { sku } : {}),
    url,
    brand: { "@type": "Brand", name: SITE_CONFIG.brandName },
    ...(offers ? { offers } : {}),
  };
}

/** Product + Offer JSON-LD for an Air/Room/Linen product, from its canonical Hours data — the SAME
 *  builder as candles (no separate air schema engine). Gradient placeholder images are dropped by
 *  productLd; a single price yields a single Offer with InStock availability; an unpriced hour yields a
 *  Product with no Offer (never a ₹0 InStock claim). */
export function airProductLd(
  hour: { name: string; productSlug: string; price: number; priceLabel: string; cardImage?: string; sku?: string | null },
  description?: string | null,
  opts: { discontinued?: boolean } = {},
): Record<string, unknown> {
  return productLd({
    name: hour.name,
    slug: hour.productSlug,
    description: description ?? null,
    gallery: hour.cardImage ? [{ src: hour.cardImage }] : [],
    priceLabel: hour.priceLabel,
    variants: hour.price > 0 ? [{ price: hour.price, inStock: true }] : [],
    price: hour.price,
    sku: hour.sku ?? null,
    discontinued: opts.discontinued,
  });
}
