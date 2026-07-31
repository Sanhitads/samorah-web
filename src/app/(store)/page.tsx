import type { Metadata } from "next";
import { getHomepageSections } from "@/services/homepageService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { PreviewBanner } from "@/components/page/PreviewBanner";
import { SectionTracker } from "@/components/analytics/SectionTracker";
import { JsonLd } from "@/components/seo/JsonLd";
import { withRouteSeo, getRouteStructuredData } from "@/services/seoRedirectService";

/**
 * Homepage — consumer #1 of the Composable Page framework. Composition + content are
 * DB-driven via the Homepage Builder; the shared <ComposedSections> renders the
 * typed section list (config fallback). Draft preview is opt-in via `?preview=1`
 * (staff-gated) — self-limiting, so the plain URL is always the live page.
 */
export const dynamic = "force-dynamic";

/** Homepage metadata reads DB SEO overrides (path "/") over the site defaults. */
export function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/", {});
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  const preview = sp.preview === "1" ? (await requireStaff("editor")).ok : false;
  const [sections, structuredData] = await Promise.all([getHomepageSections({ preview }), getRouteStructuredData("/")]);

  return (
    <main>
      {structuredData ? <JsonLd data={structuredData} /> : null}
      {preview ? <PreviewBanner label="homepage" livePath="/" /> : null}
      <ComposedSections sections={sections} track={!preview} />
      {preview ? null : <SectionTracker pageKey="homepage" />}
    </main>
  );
}
