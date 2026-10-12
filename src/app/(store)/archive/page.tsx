import Link from "next/link";
import type { Metadata } from "next";
import { getArchivedProducts } from "@/services/productService";
import { getEditionMap } from "@/services/collectionService";
import { buildShopPage, type ShopProductInput } from "@/lib/shopPage";
import { ProductCard } from "@/components/ui/ProductCard";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * The Samorah Archive — `/archive`. A PERMANENT page: it exists whether or not any product has been
 * archived. With archived products it renders the normal product grid (reusing the Shop card); with
 * none it renders a designed, editorial empty state — never a 404. A 404 is only correct when the
 * route itself doesn't exist, or for an individual product that genuinely isn't found (handled by the
 * /shop/[slug] route, which this page does not touch).
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/archive", {
    title: "The Archive",
    description: "Fragrances that have left the current collection — the Samorah Archive.",
    alternates: { canonical: "/archive" },
    openGraph: { title: "The Archive · Samorah", description: "Fragrances that have left the current collection.", type: "website" },
  });
}

export default async function ArchiveRoute() {
  // Never throw the page into a 404 — a data hiccup degrades to the (valid) empty state.
  let cards: ReturnType<typeof buildShopPage>["cards"] = [];
  try {
    const [products, editions] = await Promise.all([getArchivedProducts(), getEditionMap()]);
    cards = buildShopPage(products as unknown as ShopProductInput[], {}, editions).cards;
  } catch {
    cards = [];
  }

  return (
    <main className="plp archive">
      <header className="plp__head">
        <p className="plp__eyebrow">Archive</p>
        <h1 className="plp__title">The Archive</h1>
      </header>

      {cards.length > 0 ? (
        <ul className="plp__grid">
          {cards.map((card) => (
            <li key={card.slug} className="plp__cell">
              <ProductCard product={card} variant="shop" a11y={{ headingLevel: 2 }} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="archive-empty" aria-labelledby="archive-empty-title">
          <h2 id="archive-empty-title" className="archive-empty__title">Nothing has been archived yet.</h2>
          <p className="archive-empty__copy">When a fragrance leaves the current collection, you&rsquo;ll find it here.</p>
          <Link href="/shop" className="archive-empty__cta">Explore the Fragrance Library</Link>
        </section>
      )}
    </main>
  );
}
