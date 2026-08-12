import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { ContactContent, type ContactBlock } from "@/components/contact/ContactContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPage } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { splitClosing } from "@/lib/cms/pageContent";
import { withRouteSeo } from "@/services/seoRedirectService";
import type { ContactFormConfig } from "@/lib/contact";
import { canonicalOrigin } from "@/config/site";

/**
 * Contact — a CMS-managed "Pages" route (edited at /admin/content/contact) on the same
 * architecture as the policy pages, plus a validated contact form. Editorial content comes from
 * CMS (blocks read by position); contact methods/hours/studio/social resolve from Site Settings
 * (single source). Emits ContactPage JSON-LD. Server-rendered, force-dynamic.
 */
const SLUG = "contact";
export const dynamic = "force-dynamic";

const META_DESCRIPTION = "Get in touch with Samorah for product enquiries, orders, support or general questions.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Contact Us";
  const description = p?.seo.description || META_DESCRIPTION;
  return withRouteSeo("/contact", {
    title,
    description,
    alternates: { canonical: "/contact" },
    openGraph: {
      title,
      description,
      type: "website",
      ...(p?.seo.ogImage ? { images: [p.seo.ogImage] } : {}),
    },
  });
}

const resolveTokens = (b: ContactBlock | undefined, map: Record<string, string>): ContactBlock | undefined =>
  b && { ...b, body: (b.body ?? []).map((line) => Object.entries(map).reduce((s, [t, v]) => s.split(t).join(v), line)) };

export default async function Page() {
  const [p, site] = await Promise.all([getPage(SLUG), getSiteSettings()]);
  if (!p) notFound();

  const { sections, closing } = splitClosing(p.sections);
  const tokens = { "{{studioAddress}}": site.support.studioAddress || "", "{{businessHours}}": site.support.hours || "", "{{supportEmail}}": site.support.email || "" };
  const [intro, studio, hours, response] = [0, 1, 2, 3].map((i) => resolveTokens(sections[i], tokens));

  const formConfig = (p.form ?? {}) as ContactFormConfig;

  // ContactPage structured data.
  const ld = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: p.title,
    url: `${canonicalOrigin()}/contact`,
    mainEntity: {
      "@type": "Organization",
      name: "Samorah",
      email: site.support.email || undefined,
      telephone: site.support.phone || undefined,
      ...(site.support.studioAddress ? { address: site.support.studioAddress } : {}),
    },
  };

  return (
    <>
      <JsonLd data={ld} />
      <LegalPage eyebrow={p.eyebrow} title={p.title} intro={p.intro} sections={[]} closing={closing} heroBand>
        <ContactContent
          intro={intro}
          studio={studio}
          hours={hours}
          response={response}
          methods={{ email: site.support.email, whatsapp: site.support.whatsapp, phone: site.support.phone }}
          social={site.social}
          formConfig={formConfig}
        />
      </LegalPage>
    </>
  );
}
