import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug, getProducts, getRelatedProducts } from "@/services/productService";
import { buildProductPage, type ProductInput } from "@/lib/productPage";
import { buildCandleEditorial, type RelatedProductInput } from "@/lib/productEditorial";
import { chapterTheme } from "@/lib/chapterPage";
import { getArtist } from "@/config/artist";
import { AssetImage } from "@/components/ui/AssetImage";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { AirProductDetail } from "@/components/product/AirProductDetail";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { bootstrapPlatform } from "@/components/page/bootstrap";
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
    return {
      title: `${p.name} · Samorah`,
      description: p.tagline ?? `${p.name} — a Samorah scented candle.`,
      openGraph: { title: `${p.name} · Samorah`, description: p.tagline ?? "", type: "website" },
    };
  }
  const air = getHourBySlug(slug);
  if (air) {
    return {
      title: `${air.hour.name} · The Hours · Samorah`,
      description: air.hour.story,
      openGraph: { title: `${air.hour.name} · Samorah`, description: air.hour.story, type: "website" },
    };
  }
  return {};
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
  const raw = product as unknown as ProductInput & {
    id: string;
    fragrance_family: string | null;
    collection_id: string | null;
  };
  const p = buildProductPage(raw);

  bootstrapPlatform();
  const related = (await getRelatedProducts(
    { id: raw.id, fragrance_family: raw.fragrance_family, collection_id: raw.collection_id },
    4,
  )) as unknown as RelatedProductInput[];
  const editorial = buildCandleEditorial({ view: p, artist: getArtist(null), related });
  const palette = chapterTheme(p.chapterSlug);

  return (
    <main className="pdp" data-theme="warm-ivory">
      <nav className="pdp__breadcrumb" aria-label="Breadcrumb">
        {p.breadcrumb.map((c, i) => (
          <span key={c.href}>
            {i > 0 ? <span className="pdp__crumb-sep" aria-hidden="true">·</span> : null}
            {i < p.breadcrumb.length - 1 ? (
              <Link href={c.href} className="pdp__crumb">{c.label}</Link>
            ) : (
              <span className="pdp__crumb pdp__crumb--current">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="pdp__layout">
        <div className="pdp__gallery">
          <div className="pdp__image">
            <AssetImage asset={p.gallery[0]?.src} alt={p.gallery[0]?.alt ?? p.name} role="detail" priority className="pdp__image-fill" />
          </div>
          {p.gallery.length > 1 ? (
            <div className="pdp__thumbs">
              {p.gallery.map((g, i) => (
                <div key={i} className="pdp__thumb" data-active={i === 0}>
                  <AssetImage asset={g.src} alt={g.alt} role="detail" className="pdp__thumb-fill" />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pdp__info">
          {p.chapterName ? (
            p.chapterHref ? (
              <Link href={p.chapterHref} className="pdp__chapter">{p.chapterName}</Link>
            ) : (
              <p className="pdp__chapter">{p.chapterName}</p>
            )
          ) : null}
          <h1 className="pdp__name">{p.name}</h1>
          {p.tagline ? <p className="pdp__tagline">{p.tagline}</p> : null}
          {p.scentGroup ? <p className="pdp__scent-group">{p.scentGroup}</p> : null}

          <ProductPurchasePanel
            product={{
              id: p.id,
              slug: p.slug,
              name: p.name,
              chapterName: p.chapterName,
              vessels: p.vessels,
              sizes: p.sizes,
              variants: p.variants,
              defaultVariantId: p.defaultVariantId,
              priceLabel: p.priceLabel,
            }}
          />

          {p.details.length > 0 ? (
            <dl className="pdp__details">
              {p.details.map((d) => (
                <div key={d.label} className="pdp__detail">
                  <dt className="pdp__detail-label">{d.label}</dt>
                  <dd className="pdp__detail-value">{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      <div className="pdp__editorial">
        <SectionRenderer
          sections={editorial}
          context={{ pageId: p.slug, themeToken: palette, preview: false, data: { productSlug: p.slug } }}
        />
      </div>
    </main>
  );
}
