import type { Metadata } from "next";
import { getAboutSections } from "@/services/aboutService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { PreviewBanner } from "@/components/page/PreviewBanner";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * About — consumer #2 of the Composable Page framework. Same engine, same shared
 * <ComposedSections> renderer, same reusable section types as the homepage — only
 * the page key and default composition differ. A new editorial page is a config.
 */
export const dynamic = "force-dynamic";

/** Metadata reads DB SEO overrides (slice 6) layered over the natural defaults. */
export async function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/about", { title: "About" });
}

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  const preview = sp.preview === "1" ? (await requireStaff("editor")).ok : false;
  const sections = await getAboutSections({ preview });

  return (
    <main>
      {preview ? <PreviewBanner label="About page" livePath="/about" /> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
