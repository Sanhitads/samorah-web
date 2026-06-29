import type { Metadata } from "next";
import type { Page } from "@/platform/page";
import { resolveAsset } from "@/platform/assetResolver";

/**
 * Page SEO (§19) — map a page's `SeoMeta` onto Next's `Metadata` for
 * `generateMetadata`. The OG image is resolved through the asset resolver
 * (Registry → Alias → Gradient → URL); gradient placeholders are omitted (no
 * real image yet). JSON-LD is rendered by `PageView`, not here. Principle:
 * Assets before URLs.
 */
function ogImageUrl(ref: string | undefined): string | undefined {
  const asset = resolveAsset(ref);
  const url = asset?.desktop;
  if (!url || url.startsWith("gradient:")) return undefined;
  return url;
}

export function buildPageMetadata(page: Page): Metadata {
  const seo = page.seo;
  const image = ogImageUrl(seo.ogImage);
  const images = image ? [{ url: image }] : undefined;

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      images,
    },
    twitter: {
      card: seo.twitterCard ?? "summary_large_image",
      title: seo.title,
      description: seo.description,
      images,
    },
  };
}
