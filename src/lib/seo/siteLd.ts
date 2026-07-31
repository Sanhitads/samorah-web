/**
 * Site-wide structured data (Phase 7 · point 31) — the automatic Organization + WebSite JSON-LD that
 * every store page carries (search engines use it for the brand knowledge panel + sitelinks search box).
 * Per-route custom JSON-LD (edited in the SEO panel) is emitted on top of this. Pure.
 */
import { canonicalOrigin, canonicalUrl, SITE_CONFIG } from "@/config/site";

export function siteStructuredData(): Record<string, unknown> {
  const origin = canonicalOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_CONFIG.brandName,
        url: origin,
        logo: canonicalUrl("/logo.png"),
        description: "Slow-crafted luxury scented candles inspired by ritual, silence and timeless warmth.",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: SITE_CONFIG.brandName,
        url: origin,
        publisher: { "@id": `${origin}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
