import Link from "next/link";
import type { Metadata } from "next";
import { getShopCatalog } from "@/services/shopCatalog";
import { buildShopPage, canonicalShopUrl, type ShopProductInput } from "@/lib/shopPage";
import type { ProductEdition } from "@/services/collectionService";
import { ProductCard } from "@/components/ui/ProductCard";
import { ShopToolbar } from "@/components/shop/ShopToolbar";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Shop PLP (Template C) — `/shop`. The functional browse grid across EVERY
 * published product type (candles + Room/Linen sprays today), filterable by
 * Product Type × Chapter × Vessel and sortable, via shareable query params
 * (link-based, no client island). ISR so catalogue edits propagate.
 */
export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; chapter?: string; vessel?: string; sort?: string; tag?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  return withRouteSeo("/shop", {
    title: "Shop",
    description:
      "Every Samorah fragrance — scented candles, room and linen sprays, across our chapters. Filter by type, chapter and vessel.",
    // Friendly aliases resolve to the canonical slug URL for SEO.
    alternates: { canonical: canonicalShopUrl(params) },
    openGraph: { title: "Shop · Samorah", description: "Every Samorah fragrance, across our chapters.", type: "website" },
  });
}

export default async function ShopRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; chapter?: string; vessel?: string; sort?: string; tag?: string }>;
}) {
  const params = await searchParams;
  let products: ShopProductInput[] = [];
  let editions: Map<string, ProductEdition> = new Map();
  try {
    ({ products, editions } = await getShopCatalog());
  } catch {
    products = [];
  }
  const view = buildShopPage(products, params, editions);

  return (
    <main className="plp">
      <header className="plp__head">
        <p className="plp__eyebrow">Shop</p>
        <h1 className="plp__title">
          {view.activeTag === "bestseller" ? "Best Sellers" : view.activeTag === "new-arrival" ? "New Arrivals" : "The Collection"}
        </h1>
      </header>

      <ShopToolbar
        count={view.shown}
        activeCount={view.activeCount}
        activeType={view.activeType}
        activeChapter={view.activeChapter}
        activeVessel={view.activeVessel}
        activeTag={view.activeTag}
        activeSort={view.activeSort}
        typeOptions={view.typeOptions}
        chapterOptions={view.chapterOptions}
        vesselOptions={view.vesselOptions}
        tagOptions={view.tagOptions}
        sorts={view.sorts}
      />

      {/* Collection/list impression — GA4 view_item_list (review points 2, 3). */}
      {view.cards.length > 0 ? (
        <TrackEvent event="view_item_list" params={{ item_list_name: "Shop", items: view.cards.slice(0, 24).map((c) => ({ item_id: c.slug, item_name: c.name, item_category: c.collectionType, item_list_name: "Shop" })) }} />
      ) : null}

      {view.cards.length > 0 ? (
        <ul className="plp__grid">
          {view.cards.map((card) => (
            <li key={card.slug} className="plp__cell">
              <ProductCard product={card} variant="shop" a11y={{ headingLevel: 2 }} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="plp__empty">
          <p className="plp__empty-title">No products match this selection.</p>
          <p className="plp__empty-sub">Explore another type or chapter, or return to the full collection.</p>
          <Link href="/shop" className="plp__empty-link">
            View the full collection
          </Link>
        </div>
      )}
    </main>
  );
}
