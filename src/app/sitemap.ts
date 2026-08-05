import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/config/site";
import { getShopCatalog } from "@/services/shopCatalog";
import { getCollections } from "@/services/collectionService";
import { getAirVolumes } from "@/config/theHours";
import { listSeoOverrides } from "@/services/seoRedirectService";
import { getRedirectMap, normalizePath } from "@/lib/redirects";
import { applySitemapSeo, type SitemapEntry } from "@/lib/seo/sitemap";

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
    // Known indexable editorial routes (composable pages, always live). Generalized CMS-page sitemap
    // discovery is deferred (would need a route inventory) — see POST_LAUNCH_ROADMAP.
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/journal", changeFrequency: "weekly", priority: 0.5 },
    ...getAirVolumes().map((v) => ({ path: `/collections/${v.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];

  try {
    const [{ products }, cols, overrides, redirectMap] = await Promise.all([
      getShopCatalog(),
      getCollections() as Promise<{ slug: string; is_coming_soon?: boolean }[]>,
      listSeoOverrides(),
      getRedirectMap(),
    ]);
    for (const p of products) base.push({ path: `/shop/${p.slug}`, changeFrequency: "weekly", priority: 0.7 });
    // Exclude coming-soon chapters locally in the sitemap (storefront lifecycle services are unchanged).
    for (const c of cols) if (!c.is_coming_soon) base.push({ path: `/chapters/${c.slug}`, changeFrequency: "monthly", priority: 0.6 });

    const isRedirectSource = (key: string) => redirectMap.has(normalizePath(key));
    return applySitemapSeo(base, overrides, isRedirectSource).map((e) => ({ url: canonicalUrl(e.path), changeFrequency: e.changeFrequency, priority: e.priority }));
  } catch {
    // Build-time fetch failure → static routes only (no override/redirect application).
    return applySitemapSeo(base, [], () => false).map((e) => ({ url: canonicalUrl(e.path), changeFrequency: e.changeFrequency, priority: e.priority }));
  }
}
