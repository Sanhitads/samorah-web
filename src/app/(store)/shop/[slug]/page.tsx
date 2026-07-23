import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { withRouteSeo } from "@/services/seoRedirectService";
import { getProductBySlug, getProducts, getRelatedProducts, getAirSiblings, AIR_PRODUCT_TYPES } from "@/services/productService";
import { buildAirViewFromDb } from "@/lib/airFromProduct";
import { buildProductPage, type ProductInput } from "@/lib/productPage";
import { buildCandleEditorial, buildProductArtist, type RelatedProductInput } from "@/lib/productEditorial";
import { chapterTheme } from "@/lib/chapterPage";
import { productLd } from "@/lib/seo/productLd";
import { getEditionMap } from "@/services/collectionService";
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
  const product = await getProductBySlug(slug);
  return product ? buildProductPage(product as unknown as ProductInput) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (p) {
    return withRouteSeo(`/shop/${slug}`, {
      title: `${p.name} · Samorah`,
      description: p.tagline ?? `${p.name} — a Samorah scented candle.`,
      openGraph: { title: `${p.name} · Samorah`, description: p.tagline ?? "", type: "website" },
    });
  }
  const air = getHourBySlug(slug);
  if (air) {
    return withRouteSeo(`/shop/${slug}`, {
      title: `${air.hour.name} · The Hours · Samorah`,
      description: air.hour.story,
      openGraph: { title: `${air.hour.name} · Samorah`, description: air.hour.story, type: "website" },
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
  const product = await getProductBySlug(slug);
  if (!product) {
    // Air products live in config/theHours (no DB rows yet) — same UI + builder.
    const air = getHourBySlug(slug);
    if (!air) notFound();
    const others = air.volume.groups
      .flatMap((g) => g.hours)
      .filter((h) => h.productSlug !== slug);
    return <AirProductDetail hour={air.hour} group={air.group} volume={air.volume} others={others} />;
  }
  // Air products (room / linen fresheners) render the air PDP — now from the DB, not config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbp = product as any;
  if (AIR_PRODUCT_TYPES.includes(dbp.product_type)) {
    const siblings = dbp.collection?.id ? await getAirSiblings(dbp.collection.id, dbp.id) : [];
    const { hour, group, volume, others } = buildAirViewFromDb(dbp, siblings);
    return <AirProductDetail hour={hour} group={group} volume={volume} others={others} />;
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
  const artist = buildProductArtist(product);
  const editorial = buildCandleEditorial({ view: p, artist, related });
  const palette = chapterTheme(p.chapterSlug);
  const ld = productLd({ name: p.name, slug: p.slug, description: p.tagline, gallery: p.gallery, priceLabel: p.priceLabel, variants: p.variants });

  return <CandleProductDetail p={p} editorial={editorial} palette={palette} ld={ld} />;
}
