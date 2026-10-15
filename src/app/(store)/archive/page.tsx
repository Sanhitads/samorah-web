import Link from "next/link";
import type { Metadata } from "next";
import { getArchivedProducts } from "@/services/productService";
import { getEditionMap } from "@/services/collectionService";
import { buildShopPage, type ShopProductInput } from "@/lib/shopPage";
import { indexableArchivedProducts } from "@/lib/seo/sitemap";
import { ProductCard } from "@/components/ui/ProductCard";
import { withRouteSeo } from "@/services/seoRedirectService";

// Shape the eligibility filter reads (status='archived' rows carry these visibility flags).
type ArchivedRow = { slug?: string | null; is_coming_soon?: boolean | null; visible_website?: boolean | null };

/**
 * The Samorah Archive — `/archive`. A PERMANENT page: it exists whether or not any product has been
 * archived. With archived products it renders the normal product grid (reusing the Shop card); with
 * none it renders a designed, editorial empty state — never a 404. A 404 is only correct when the
 * route itself doesn't exist, or for an individual product that genuinely isn't found (handled by the
 * /shop/[slug] route, which this page does not touch).
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  // An EMPTY archive is a valid 200 page but thin content → noindex, follow (and it stays out of the
  // sitemap). Once it holds archived products it becomes index/follow (the root default). An admin
  // seo_override still wins over this via withRouteSeo.
  let hasArchived = false;
  try {
    hasArchived = indexableArchivedProducts((await getArchivedProducts()) as ArchivedRow[]).length > 0;
  } catch {
    hasArchived = false;
  }
  return withRouteSeo("/archive", {
    title: "The Archive",
    description: "Fragrances that have left the current collection — the Samorah Archive.",
    alternates: { canonical: "/archive" },
    openGraph: { title: "The Archive · Samorah", description: "Fragrances that have left the current collection.", type: "website" },
    ...(hasArchived ? {} : { robots: { index: false, follow: true } }),
  });
}

export default async function ArchiveRoute() {
  // Never throw the page into a 404 — a data hiccup degrades to the (valid) empty state.
  let cards: ReturnType<typeof buildShopPage>["cards"] = [];
  try {
    const [archived, editions] = await Promise.all([getArchivedProducts(), getEditionMap()]);
    // Show only publicly-eligible archived products (hidden / coming-soon excluded) — same set the sitemap uses.
    const products = indexableArchivedProducts(archived as ArchivedRow[]);
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
