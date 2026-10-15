import type { Metadata } from "next";
import { getAboutSections } from "@/services/aboutService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { PreviewBanner } from "@/components/page/PreviewBanner";
import { JsonLd } from "@/components/seo/JsonLd";
import { withRouteSeo, getRouteStructuredData } from "@/services/seoRedirectService";

/**
 * About — consumer #2 of the Composable Page framework. Same engine, same shared
 * <ComposedSections> renderer, same reusable section types as the homepage — only
 * the page key and default composition differ. A new editorial page is a config.
 */
export const dynamic = "force-dynamic";

/** Metadata reads DB SEO overrides (slice 6) layered over the natural defaults. /about is an orphan hub
 *  (the nav routes "About" to the dedicated /our-story, /craft-materials, /the-people-behind-samorah,
 *  /contact pages, which carry the real content) — so it is noindex,follow and kept out of the sitemap to
 *  avoid a thin/duplicate indexed page. An admin seo_override can flip this; a "Set to Index" there wins. */
export async function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/about", { title: "About", robots: { index: false, follow: true } });
}

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  const preview = sp.preview === "1" ? (await requireStaff("editor")).ok : false;
  // Emit the route's custom JSON-LD (SEO override structured_data) via the canonical getRouteStructuredData
  // + JsonLd path — same mechanism as the homepage (mechanism A). No second JSON-LD store or renderer.
  const [sections, structuredData] = await Promise.all([getAboutSections({ preview }), getRouteStructuredData("/about")]);

  return (
    <main>
      {structuredData ? <JsonLd data={structuredData} /> : null}
      {preview ? <PreviewBanner label="About page" livePath="/about" /> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
