/**
 * Site-wide structured data (Phase 7 · point 31) — the automatic Organization + WebSite JSON-LD that
 * every store page carries (search engines use it for the brand knowledge panel + sitelinks search box).
 * Per-route custom JSON-LD (edited in the SEO panel) is emitted on top of this. Pure.
 */
import { canonicalOrigin, SITE_CONFIG } from "@/config/site";

const DEFAULT_ORG_DESCRIPTION = "Slow-crafted luxury scented candles inspired by ritual, silence and timeless warmth.";

/**
 * `opts.description` lets the store layout pass the admin-maintained site default (settings.seo), so the
 * brand description stays editable and can broaden beyond candles without a code change; it falls back to
 * the existing copy when unset. The Organization `logo` is intentionally OMITTED until a real, crawlable
 * brand asset exists — structured data must never point at a 404 (no placeholder logo is invented). The
 * WebSite `SearchAction` is also removed because there is no public /search route to target.
 */
export function siteStructuredData(opts: { description?: string } = {}): Record<string, unknown> {
  const origin = canonicalOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_CONFIG.brandName,
        url: origin,
        description: opts.description || DEFAULT_ORG_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: SITE_CONFIG.brandName,
        url: origin,
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}
