import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { getPage } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { injectSupportEmail, splitClosing } from "@/lib/cms/pageContent";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Privacy Policy — a CMS-managed "Pages" route (edited at /admin/content/privacy).
 * Renders entirely from CMS content: the published cms_pages row, or the config seed
 * (LEGAL.privacy) until it's saved. Two things are resolved server-side at render:
 *   • the Contact email comes from Site Settings (never hard-coded), and
 *   • "Last updated" comes from the CMS row's metadata.
 * Server-rendered, force-dynamic (the CMS "Pages" caching strategy) — no client fetch.
 */
const SLUG = "privacy";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Privacy Policy";
  const description = p?.seo.description || p?.intro || undefined;
  // Base from the page's own inline SEO; withRouteSeo layers admin overrides
  // (canonical, OG image, robots) from the shared SEO system on top.
  return withRouteSeo("/privacy", {
    title,
    description,
    alternates: { canonical: "/privacy" },
    openGraph: {
      title,
      description,
      type: "website",
      ...(p?.seo.ogImage ? { images: [p.seo.ogImage] } : {}),
    },
  });
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : undefined;

export default async function Page() {
  const [p, site] = await Promise.all([getPage(SLUG), getSiteSettings()]);
  if (!p) notFound();

  // Contact email is single-sourced from Site Settings (falls back to config within
  // the service); an absent value degrades to a graceful, honest line.
  const injected = injectSupportEmail(p.sections, site.support.email);
  // The trailing heading-less section is the closing signature — rendered distinctly.
  const { sections, closing } = splitClosing(injected);

  // Page metadata from existing CMS fields — never hard-coded. Effective date is the
  // editable "Publish at" (falls back to first-created); last updated is the save time.
  const effectiveDate = fmtDate(p.publishAt ?? p.createdAt);
  const lastUpdated = fmtDate(p.updatedAt);

  return (
    <LegalPage
      eyebrow={p.eyebrow}
      title={p.title}
      intro={p.intro}
      sections={sections}
      closing={closing}
      effectiveDate={effectiveDate}
      lastUpdated={lastUpdated}
      heroBand
    />
  );
}
