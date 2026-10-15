import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { withRouteSeo } from "@/services/seoRedirectService";
import { getProductBySlug, getArchivedProductBySlug, getProducts, getRelatedProducts, getAirSiblings, AIR_PRODUCT_TYPES } from "@/services/productService";
import { buildAirViewFromDb } from "@/lib/airFromProduct";
import { buildProductPage, type ProductInput } from "@/lib/productPage";
import { buildCandleEditorial, buildProductArtist, applyCandleViewOverrides, type RelatedProductInput, type CandlePdpContent } from "@/lib/productEditorial";
import { chapterTheme } from "@/lib/chapterPage";
import { productLd } from "@/lib/seo/productLd";
import { pdpMetaBase } from "@/lib/seo/pdpMeta";
import { getEditionMap } from "@/services/collectionService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { AirProductDetail } from "@/components/product/AirProductDetail";
import { CandleProductDetail } from "@/components/product/CandleProductDetail";
import { getAirVolumes, getHourBySlug } from "@/config/theHours";

/**
 * Product page (Phase 9) — `/shop/[slug]`. A focused commerce page (not the
 * section engine): real variants / prices / stock, editorial styling, reusing
 * the platform atoms. Beat 1 = the buyable core (gallery · info · purchase).
 * ISR so catalog edits propagate; stock is re-checked at checkout.
 */
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const airSlugs = getAirVolumes().flatMap((v) =>
    v.groups.flatMap((g) => g.hours.map((h) => ({ slug: h.productSlug }))),
  );
  try {
    const products = await getProducts();
    return [...products.map((p) => ({ slug: p.slug })), ...airSlugs];
  } catch {
    return airSlugs;
  }
}

async function load(slug: string) {
  // Active first; fall back to an archived product so the retired PDP still gets a title/canonical/OG
  // (and stays indexable — a previously-launched edition keeps its historic URL and SEO).
  const product = (await getProductBySlug(slug)) ?? (await getArchivedProductBySlug(slug));
  if (!product) return null;
  const p = buildProductPage(product as unknown as ProductInput);
  // Per-product CMS SEO (written in the product editor). Threaded into metadata so it actually renders.
  const raw = product as { seo_title?: string | null; seo_description?: string | null; seo_canonical?: string | null; seo_og_image?: string | null };
  // Honour the product's CMS canonical — EXCEPT a stale pre-replatform value that points at the old
  // /products/[slug] structure, which must never be treated as canonical (the canonical is /shop/[slug]).
  const rawCanonical = raw.seo_canonical || undefined;
  const canonical = rawCanonical && !/(^|\/)products\//.test(rawCanonical) ? rawCanonical : undefined;
  const seo = { title: raw.seo_title || undefined, description: raw.seo_description || undefined, canonical, ogImage: raw.seo_og_image || undefined };
  return { p, seo };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await load(slug);
  if (loaded) {
    const { p, seo } = loaded;
    // PDP metadata precedence: route override (applied by withRouteSeo) → product CMS SEO → generated PDP
    // fallback → site default. Built by the shared pdpMetaBase so ACTIVE and ARCHIVED products get the
    // identical social-metadata hierarchy (there is no archived branch here).
    return withRouteSeo(`/shop/${slug}`, pdpMetaBase(slug, p, seo));
  }
  const air = getHourBySlug(slug);
  if (air) {
    const metaTitle = `${air.hour.name} · The Hours`; // no brand → template brands it once ("… | Samorah")
    const ogTitle = `${air.hour.name} · Samorah`;
    return withRouteSeo(`/shop/${slug}`, {
      title: metaTitle,
      description: air.hour.story,
      alternates: { canonical: `/shop/${slug}` },
      openGraph: { title: ogTitle, description: air.hour.story, type: "website", url: `/shop/${slug}` },
      twitter: { card: "summary_large_image", title: ogTitle, description: air.hour.story },
    });
  }
  return withRouteSeo(`/shop/${slug}`, {});
}

export default async function ProductRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Free-shipping threshold from admin Site Settings — the house PDP "Shipping" copy tracks it (single source).
  const [active, { shipping: shipCfg }] = await Promise.all([getProductBySlug(slug), getSiteSettings()]);
  let product = active;
  let retired = false;
  if (!product) {
    // Air products live in config/theHours (no DB rows yet) — same UI + builder.
    const air = getHourBySlug(slug);
    if (air) {
      const others = air.volume.groups
        .flatMap((g) => g.hours)
        .filter((h) => h.productSlug !== slug);
      return <AirProductDetail hour={air.hour} group={air.group} volume={air.volume} others={others} freeShippingThresholdInr={shipCfg.freeThreshold} />;
    }
    // Archived product — the Samorah Archive keeps the historic /shop/[slug] URL live as a retired (HTTP
    // 200) page via a secure server-only read. A genuinely unknown slug still 404s (no soft-404).
    product = await getArchivedProductBySlug(slug);
    retired = !!product;
    if (!product) notFound();
  }
  // Air products (room / linen fresheners) render the air PDP — active or retired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbp = product as any;
  if (AIR_PRODUCT_TYPES.includes(dbp.product_type)) {
    const siblings = retired ? [] : dbp.collection?.id ? await getAirSiblings(dbp.collection.id, dbp.id) : [];
    const { hour, group, volume, others } = buildAirViewFromDb(dbp, siblings);
    return <AirProductDetail hour={hour} group={group} volume={volume} others={others} freeShippingThresholdInr={shipCfg.freeThreshold} retired={retired} />;
  }

  const raw = product as unknown as ProductInput & {
    id: string;
    fragrance_family: string | null;
    collection_id: string | null;
  };
  const p = buildProductPage(raw);

  // Samorah numbering — from the shared edition map, so the PDP, cart, and
  // composition all show identical "VOL. I.1" editions.
  const editions = await getEditionMap();
  p.edition = editions.get(p.slug)?.edition ?? p.edition;

  // "Continue the Chapter" — SAME chapter only (Decision 25), excluding this
  // product; forcing fragrance_family null makes the rule match by collection.
  const related = (await getRelatedProducts(
    { id: raw.id, fragrance_family: null, collection_id: raw.collection_id },
    4,
  )) as unknown as RelatedProductInput[];
  // Number the "Continue the Chapter" cards with the same shared edition map as everything else.
  for (const r of related) {
    r.edition = editions.get(r.slug)?.edition ?? r.edition ?? null;
    // Collection-type label (Core / Limited …) lives in pdp_content — same source as the hero.
    const raw = r as unknown as { pdp_content?: { collectionType?: string | null } | null };
    r.collectionType = raw.pdp_content?.collectionType || r.collectionType || null;
  }
  const artist = buildProductArtist(product);
  const pdpContent = ((product as { pdp_content?: CandlePdpContent | null }).pdp_content) ?? undefined;
  applyCandleViewOverrides(p, pdpContent); // edition / collection-type / per-size burn time overrides
  const editorial = buildCandleEditorial({ view: p, artist, related, content: pdpContent, freeShippingThresholdInr: shipCfg.freeThreshold });
  const palette = pdpContent?.palette || chapterTheme(p.chapterSlug);
  const ld = productLd({ name: p.name, slug: p.slug, description: p.tagline, gallery: p.gallery, priceLabel: p.priceLabel, variants: p.variants, sku: (product as { base_sku?: string | null }).base_sku ?? null, discontinued: retired });

  return <CandleProductDetail p={p} editorial={editorial} palette={palette} ld={ld} content={pdpContent} retired={retired} />;
}
