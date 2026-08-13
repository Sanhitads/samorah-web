import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeopleContent } from "@/components/people/PeopleContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPage } from "@/services/cmsService";
import { withRouteSeo } from "@/services/seoRedirectService";
import { canonicalOrigin } from "@/config/site";
import type { SectionImage } from "@/lib/cms/sections";

/**
 * Craft & Materials — a CMS-managed "Pages" route (edited at /admin/content/craft-materials) on the
 * same architecture as Product Care / Behind Samorah. It reuses the editorial PeopleContent renderer
 * (hero image + features + overlays + dividers + statements) — the makers are person features, the
 * materials are features or narrow statements. Answers "how is a Samorah object thoughtfully made".
 * Emits Breadcrumb JSON-LD. Server-rendered, force-dynamic.
 */
const SLUG = "craft-materials";
export const dynamic = "force-dynamic";

const META_DESCRIPTION =
  "How a Samorah object is thoughtfully made — the hands behind it, and the materials chosen with care: the vessel, wax, fragrance and wick.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Craft & Materials";
  const description = p?.seo.description || p?.intro?.split("\n")[0] || META_DESCRIPTION;
  return withRouteSeo("/craft-materials", {
    title,
    description,
    alternates: { canonical: "/craft-materials" },
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
      { "@type": "ListItem", position: 2, name: p.title, item: `${origin}/craft-materials` },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <PeopleContent eyebrow={p.eyebrow} title={p.title} intro={p.intro} heroImage={heroImage} sections={p.sections} />
    </>
  );
}
