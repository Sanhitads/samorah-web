import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { FaqAccordion, type FaqCategory } from "@/components/faq/FaqAccordion";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPage } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { splitClosing, SUPPORT_EMAIL_TOKEN, SUPPORT_UNAVAILABLE } from "@/lib/cms/pageContent";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * FAQ — a CMS-managed "Pages" route (edited at /admin/content/faq) on the same architecture
 * as the policy pages, but its sections are CATEGORIES (heading + items) rendered as a minimal
 * accordion inside the shared LegalPage hero/closing shell. Contact answer's {{supportEmail}}
 * resolves from Site Settings. Emits FAQPage JSON-LD. Server-rendered, force-dynamic.
 */
const SLUG = "faq";
export const dynamic = "force-dynamic";

const META_DESCRIPTION = "Find answers about Samorah orders, shipping, fragrances, candle care, returns and customer support.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Frequently Asked Questions";
  const description = p?.seo.description || META_DESCRIPTION;
  return withRouteSeo("/faq", {
    title,
    description,
    alternates: { canonical: "/faq" },
    openGraph: {
      title,
      description,
      type: "website",
      ...(p?.seo.ogImage ? { images: [p.seo.ogImage] } : {}),
    },
  });
}

export default async function Page() {
  const [p, site] = await Promise.all([getPage(SLUG), getSiteSettings()]);
  if (!p) notFound();

  // The trailing heading-less section is the closing quote; the rest are categories.
  const { sections, closing } = splitClosing(p.sections);
  const emailOrFallback = (site.support.email || "").trim() || SUPPORT_UNAVAILABLE;
  const categories: FaqCategory[] = sections
    .filter((s) => (s.items?.length ?? 0) > 0)
    .map((s) => ({
      category: s.heading ?? "",
      items: (s.items ?? []).map((it) => ({ q: it.q, a: it.a.split(SUPPORT_EMAIL_TOKEN).join(emailOrFallback) })),
    }));

  // FAQPage structured data (SEO) — one Question per Q&A across all categories.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: categories.flatMap((c) =>
      c.items.map((it) => ({
        "@type": "Question",
        name: it.q,
        acceptedAnswer: { "@type": "Answer", text: it.a.replace(/\s*\n+\s*/g, " ").trim() },
      })),
    ),
  };

  return (
    <>
      <JsonLd data={faqLd} />
      <LegalPage eyebrow={p.eyebrow} title={p.title} intro={p.intro} sections={[]} closing={closing} heroBand>
        <FaqAccordion categories={categories} />
      </LegalPage>
    </>
  );
}
