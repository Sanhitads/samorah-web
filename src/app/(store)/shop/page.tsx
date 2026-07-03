import Link from "next/link";
import type { Metadata } from "next";
import { getShopCatalog } from "@/services/shopCatalog";
import { buildShopPage, canonicalShopUrl, type ShopProductInput } from "@/lib/shopPage";
import type { ProductEdition } from "@/services/collectionService";
import { ProductCard } from "@/components/ui/ProductCard";

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
  searchParams: Promise<{ type?: string; chapter?: string; vessel?: string; sort?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Shop",
    description:
      "Every Samorah fragrance — scented candles, room and linen sprays, across our chapters. Filter by type, chapter and vessel.",
    // Friendly aliases resolve to the canonical slug URL for SEO.
    alternates: { canonical: canonicalShopUrl(params) },
    openGraph: { title: "Shop · Samorah", description: "Every Samorah fragrance, across our chapters.", type: "website" },
  };
}

export default async function ShopRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; chapter?: string; vessel?: string; sort?: string }>;
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
        <p className="plp__eyebrow">The Shop</p>
        <h1 className="plp__title">All Products</h1>
        <p className="plp__count">{view.shown} {view.shown === 1 ? "Product" : "Products"}</p>
      </header>

      <div className="plp__controls">
        <div className="plp__facets">
          <div className="plp__facet">
            <span className="plp__facet-label">Type</span>
            <nav className="plp__filters" aria-label="Filter by product type">
              {view.types.map((t) =>
                t.disabled ? (
                  <span key={t.key} className="plp__filter plp__filter--soon" aria-disabled="true">
                    <span className="plp__filter-name">
                      {t.label}
                      <span className="plp__filter-count"> · Soon</span>
                    </span>
                  </span>
                ) : (
                  <Link key={t.key} href={t.href} className="plp__filter" data-active={t.active} scroll={false}>
                    <span className="plp__filter-name">
                      {t.label}
                      <span className="plp__filter-count"> ({t.count})</span>
                    </span>
                  </Link>
                ),
              )}
            </nav>
          </div>

          <div className="plp__facet">
            <span className="plp__facet-label">Chapter</span>
            <nav className="plp__filters" aria-label="Filter by chapter">
              {view.chapters.map((c) => (
                <Link key={c.key} href={c.href} className="plp__filter" data-active={c.active} scroll={false}>
                  {c.volume ? <span className="plp__filter-vol">{c.volume}</span> : null}
                  <span className="plp__filter-name">
                    {c.label}
                    <span className="plp__filter-count"> ({c.count})</span>
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          {view.showVessel ? (
            <div className="plp__facet">
              <span className="plp__facet-label">Vessel</span>
              <nav className="plp__filters" aria-label="Filter by vessel">
                {view.vessels.map((v) => (
                  <Link key={v.key} href={v.href} className="plp__filter plp__filter--vessel" data-active={v.active} scroll={false}>
                    <span className="plp__filter-name">
                      {v.label}
                      <span className="plp__filter-count"> ({v.count})</span>
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}
        </div>

        <div className="plp__sort">
          <span className="plp__sort-label">Sort</span>
          <nav className="plp__sort-opts" aria-label="Sort products">
            {view.sorts.map((s) => (
              <Link key={s.key} href={s.href} className="plp__sort-opt" data-active={s.active} scroll={false}>
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

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
