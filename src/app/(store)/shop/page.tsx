import Link from "next/link";
import type { Metadata } from "next";
import { getShopProducts } from "@/services/productService";
import { buildShopPage, type ShopProductInput } from "@/lib/shopPage";
import { ProductCard } from "@/components/ui/ProductCard";

/**
 * Shop PLP (Template C) — `/shop`. The functional browse grid: all active
 * products, filterable by chapter and sortable, via shareable query params
 * (link-based, no client island). ISR so catalogue edits propagate.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Shop",
  description: "Every Samorah fragrance — hand-poured scented candles across our chapters. Filter by chapter, sort to taste.",
  openGraph: { title: "Shop · Samorah", description: "Every Samorah fragrance, across our chapters.", type: "website" },
};

export default async function ShopRoute({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; sort?: string }>;
}) {
  const params = await searchParams;
  let products: ShopProductInput[] = [];
  try {
    products = (await getShopProducts()) as unknown as ShopProductInput[];
  } catch {
    products = [];
  }
  const view = buildShopPage(products, params);

  return (
    <main className="plp">
      <header className="plp__head">
        <p className="plp__eyebrow">The Shop</p>
        <h1 className="plp__title">All Products</h1>
        <p className="plp__count">
          {view.shown} {view.shown === 1 ? "fragrance" : "fragrances"}
          {view.activeChapter !== "all" ? " in this chapter" : ""}
        </p>
      </header>

      <div className="plp__controls">
        <nav className="plp__filters" aria-label="Filter by chapter">
          {view.chapters.map((c) => (
            <Link key={c.key} href={c.href} className="plp__filter" data-active={c.active} scroll={false}>
              {c.label}
              <span className="plp__filter-count">{c.count}</span>
            </Link>
          ))}
        </nav>

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
        <p className="plp__empty">No fragrances here yet — please explore another chapter.</p>
      )}
    </main>
  );
}
