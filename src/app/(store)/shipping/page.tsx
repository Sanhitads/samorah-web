import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { getPage } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { injectSupportEmail, splitClosing } from "@/lib/cms/pageContent";
import { withRouteSeo } from "@/services/seoRedirectService";
import { freeShippingLabel } from "@/config/commerce";

/**
 * Shipping Policy — the existing CMS-managed "Pages" route (edited at
 * /admin/content/shipping), on the same architecture as the other policy pages.
 * Renders entirely from CMS content (published cms_pages row, or the config seed).
 * Resolved server-side at render (never hard-coded): the Contact email from Site
 * Settings, the free-shipping threshold from the shipping config, and Effective /
 * Last Updated from CMS metadata. Server-rendered, force-dynamic — no client fetch.
 */
const SLUG = "shipping";
export const dynamic = "force-dynamic";

const META_DESCRIPTION = "Learn about Samorah's shipping process, delivery timelines, shipping charges, tracking, and order fulfilment across India.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Shipping Policy";
  const description = p?.seo.description || META_DESCRIPTION;
  return withRouteSeo("/shipping", {
    title,
    description,
    alternates: { canonical: "/shipping" },
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

  // Contact email from Site Settings + the free-shipping threshold from the shipping
  // config, both resolved at render (never hard-coded).
  const withEmail = injectSupportEmail(p.sections, site.support.email);
  const threshold = freeShippingLabel(site.shipping.freeThreshold);
  const resolved = withEmail.map((s) => ({ ...s, body: (s.body ?? []).map((line) => line.replace(/\{\{freeShippingThreshold\}\}/g, threshold)) }));
  const { sections, closing } = splitClosing(resolved);

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
