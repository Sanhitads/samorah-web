import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeopleContent } from "@/components/people/PeopleContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPage } from "@/services/cmsService";
import { withRouteSeo } from "@/services/seoRedirectService";
import { canonicalOrigin } from "@/config/site";
import type { SectionImage } from "@/lib/cms/sections";

/**
 * Our Story — the signature editorial page (edited at /admin/content/our-story), on the same Pages CMS
 * and editorial renderer (PeopleContent) as Product Care / Behind Samorah / Craft & Materials. A
 * first-person, reflective journal — not a timeline or an About page. Emits Breadcrumb JSON-LD.
 */
const SLUG = "our-story";
export const dynamic = "force-dynamic";

const META_DESCRIPTION =
  "The story behind Samorah — a quiet love of candles that became a way of making: fragrance first, then artwork, then the materials, then the candle.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Our Story";
  const description = p?.seo.description || p?.intro?.split("\n")[0] || META_DESCRIPTION;
  return withRouteSeo("/our-story", {
    title,
    description,
    alternates: { canonical: "/our-story" },
    openGraph: {
      title,
      description,
      type: "website",
      ...(p?.seo.ogImage ? { images: [p.seo.ogImage] } : {}),
    },
  });
}

export default async function Page() {
  const p = await getPage(SLUG);
  if (!p) notFound();

  const heroImage = ((p.form ?? {}) as { heroImage?: SectionImage }).heroImage ?? null;
  const origin = canonicalOrigin();
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: origin },
      { "@type": "ListItem", position: 2, name: p.title, item: `${origin}/our-story` },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <PeopleContent eyebrow={p.eyebrow} title={p.title} intro={p.intro} heroImage={heroImage} sections={p.sections} />
    </>
  );
}
