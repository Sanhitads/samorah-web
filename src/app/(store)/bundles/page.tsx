import type { Metadata } from "next";
import { getBundleCandles } from "@/services/bundleService";
import { getPublishedBundleConfig, resolveBundleMedia } from "@/services/bundlePageService";
import { withRouteSeo } from "@/services/seoRedirectService";
import { BundleStorefront } from "@/components/bundle/BundleStorefront";
import { BUNDLE_DISCOUNT_PCT } from "@/lib/bundle";

/**
 * Bundle builder — `/bundles`. "Compose Your Three": pick a vessel then compose three 100g candles and
 * save the composition discount. Server-fetches the eligible candles (real variants → real prices) and
 * the published editorial BundleConfig (Bundle CMS), and hands both to the shared client renderer.
 * SEO now flows through the canonical withRouteSeo resolver so /admin/seo overrides for /bundles apply.
 */
export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/bundles", {
    title: "Build Your Collection",
    description: `Compose a set of three candles and save ${BUNDLE_DISCOUNT_PCT}% — a curated atmosphere, as personal as the rooms you live in.`,
    openGraph: {
      title: "Build Your Collection · Samorah",
      description: `Choose any three candles and save ${BUNDLE_DISCOUNT_PCT}% on your signature set.`,
      type: "website",
    },
  });
}

export default async function BundleRoute() {
  const [candles, config] = await Promise.all([
    getBundleCandles().catch(() => [] as Awaited<ReturnType<typeof getBundleCandles>>),
    getPublishedBundleConfig(),
  ]);
  const mediaUrls = await resolveBundleMedia(config);
  return <BundleStorefront config={config} candles={candles} mediaUrls={mediaUrls} />;
}
