import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/config/site";
import { getShopCatalog } from "@/services/shopCatalog";
import { getCollections } from "@/services/collectionService";
import { getAirVolumes } from "@/config/theHours";

/** sitemap.xml — every URL is canonical (config/site.ts). Products/collections
 *  are data-driven, so it stays correct as the catalogue grows. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/shop", "/bundles"].map((p) => ({
    url: canonicalUrl(p),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8,
  }));

  let products: { slug: string }[] = [];
  let chapters: { slug: string }[] = [];
  try {
    const [{ products: catalog }, cols] = await Promise.all([getShopCatalog(), getCollections()]);
    products = catalog;
    chapters = cols as { slug: string }[];
  } catch {
    /* build-time fetch failure → static routes only */
  }

  const productRoutes = products.map((p) => ({
    url: canonicalUrl(`/shop/${p.slug}`),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  const chapterRoutes = chapters.map((c) => ({
    url: canonicalUrl(`/chapters/${c.slug}`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  const airRoutes = getAirVolumes().map((v) => ({
    url: canonicalUrl(`/collections/${v.slug}`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...chapterRoutes, ...airRoutes, ...productRoutes];
}
