import type { Metadata } from "next";
import { getJournalSections } from "@/services/journalService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { PreviewBanner } from "@/components/page/PreviewBanner";
import { JsonLd } from "@/components/seo/JsonLd";
import { withRouteSeo, getRouteStructuredData } from "@/services/seoRedirectService";

/** Journal — consumer #3 of the Composable Page framework. Identical wiring to About. */
export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => withRouteSeo("/journal", { title: "Journal" });

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  const preview = sp.preview === "1" ? (await requireStaff("editor")).ok : false;
  // Custom JSON-LD via the canonical mechanism-A path (same as home/about).
  const [sections, structuredData] = await Promise.all([getJournalSections({ preview }), getRouteStructuredData("/journal")]);

  return (
    <main>
      {structuredData ? <JsonLd data={structuredData} /> : null}
      {preview ? <PreviewBanner label="Journal" livePath="/journal" /> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
