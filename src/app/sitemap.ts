import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/config/site";
import { getShopCatalog } from "@/services/shopCatalog";
import { getArchivedProducts } from "@/services/productService";
import { getCollections } from "@/services/collectionService";
import { getAirVolumes, isAirCollectionSlug } from "@/config/theHours";
import { listSeoOverrides } from "@/services/seoRedirectService";
import { getRedirectMap, normalizePath } from "@/lib/redirects";
import { applySitemapSeo, indexableArchivedProducts, type SitemapEntry } from "@/lib/seo/sitemap";

/**
 * sitemap.xml — every URL is canonical (config/site.ts). Base routes are data-driven; the canonical
 * SEO-override layer is then applied via applySitemapSeo (single batch query — no per-URL getRouteSeo,
 * no second SEO resolver): override priority/change_freq are honoured, and override-noindex routes,
 * active redirect sources and coming-soon chapters are excluded. Build-time (Node); a fetch failure
 * degrades to the static routes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: SitemapEntry[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/shop", changeFrequency: "weekly", priority: 0.8 },
    { path: "/bundles", changeFrequency: "weekly", priority: 0.8 },
    // Indexable editorial / brand / support + policy pages. Each ships a unique title, description and a
    // self-canonical. Privacy and Terms are deliberately omitted — they are noindex and stay out of the
    // sitemap. /about and /journal are omitted too (orphan/unconfirmed pages, currently noindex).
    { path: "/our-story", changeFrequency: "monthly", priority: 0.5 },
    { path: "/craft-materials", changeFrequency: "monthly", priority: 0.5 },
    { path: "/the-people-behind-samorah", changeFrequency: "monthly", priority: 0.5 },
    { path: "/product-care", changeFrequency: "monthly", priority: 0.5 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.5 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
    { path: "/shipping", changeFrequency: "monthly", priority: 0.4 },
    { path: "/returns-policy", changeFrequency: "monthly", priority: 0.4 },
    ...getAirVolumes().map((v) => ({ path: `/collections/${v.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];

  try {
    const [{ products }, cols, archived, overrides, redirectMap] = await Promise.all([
      getShopCatalog(),
      getCollections() as Promise<{ slug: string; is_coming_soon?: boolean }[]>,
      getArchivedProducts().catch(() => [] as unknown[]),
      listSeoOverrides(),
      getRedirectMap(),
    ]);
    for (const p of products) base.push({ path: `/shop/${p.slug}`, changeFrequency: "weekly", priority: 0.7 });
    // Candle chapters only: exclude coming-soon AND the air "The Hours" collections (they're already
    // listed above under their canonical /collections/<slug> URL, never /chapters/).
    for (const c of cols) if (!c.is_coming_soon && !isAirCollectionSlug(c.slug)) base.push({ path: `/chapters/${c.slug}`, changeFrequency: "monthly", priority: 0.6 });
    // Archived products that are still publicly eligible keep their historic /shop/[slug] in the sitemap
    // (200, self-canonical, indexable). The Archive index enters the sitemap only when ≥1 such product
    // exists (then it is index/follow); an empty/ineligible Archive is noindex and stays out.
    const eligibleArchived = indexableArchivedProducts(archived as { slug?: string | null; is_coming_soon?: boolean | null; visible_website?: boolean | null }[]);
    for (const p of eligibleArchived) base.push({ path: `/shop/${p.slug}`, changeFrequency: "monthly", priority: 0.5 });
    if (eligibleArchived.length > 0) base.push({ path: "/archive", changeFrequency: "monthly", priority: 0.4 });

    const isRedirectSource = (key: string) => redirectMap.has(normalizePath(key));
    return applySitemapSeo(base, overrides, isRedirectSource).map((e) => ({ url: canonicalUrl(e.path), changeFrequency: e.changeFrequency, priority: e.priority }));
  } catch {
    // Build-time fetch failure → static routes only (no override/redirect application).
    return applySitemapSeo(base, [], () => false).map((e) => ({ url: canonicalUrl(e.path), changeFrequency: e.changeFrequency, priority: e.priority }));
  }
}
