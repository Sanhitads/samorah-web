import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { getPage } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { injectSupportEmail, splitClosing } from "@/lib/cms/pageContent";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Returns & Refund Policy — a CMS-managed "Pages" route (edited at
 * /admin/content/returns-policy), built on the exact same architecture as /privacy and
 * /terms. Renders entirely from CMS content (published cms_pages row, or the config
 * seed). Resolved server-side at render: the Contact email from Site Settings (never
 * hard-coded), and Effective / Last Updated from CMS metadata. Server-rendered,
 * force-dynamic — no client fetch.
 */
const SLUG = "returns-policy";
export const dynamic = "force-dynamic";

const META_DESCRIPTION = "Read Samorah's Returns & Refund Policy covering returns, exchanges, damaged items, cancellations, and refunds.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Returns & Refund Policy";
  const description = p?.seo.description || META_DESCRIPTION;
  return withRouteSeo("/returns-policy", {
    title,
    description,
    alternates: { canonical: "/returns-policy" },
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

  const injected = injectSupportEmail(p.sections, site.support.email);
  const { sections, closing } = splitClosing(injected);

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
