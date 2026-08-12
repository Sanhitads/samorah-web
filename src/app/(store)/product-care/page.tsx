import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCareContent } from "@/components/product-care/ProductCareContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPage } from "@/services/cmsService";
import { withRouteSeo } from "@/services/seoRedirectService";
import { canonicalOrigin } from "@/config/site";

/**
 * Product Care — a CMS-managed "Pages" route (edited at /admin/content/product-care) on the same
 * architecture as the policy pages, rendered with the editorial ProductCareContent layout. Content
 * (hero + editorial steps + accordions + statements) comes from the CMS; images resolve responsively
 * via the platform image atom. Emits Breadcrumb JSON-LD. Server-rendered, force-dynamic.
 */
const SLUG = "product-care";
export const dynamic = "force-dynamic";

const META_DESCRIPTION =
  "How to care for your Samorah candles and room sprays — a quiet ritual for a cleaner burn, a longer life and fragrance that lingers with grace.";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  const title = p?.seo.title || p?.title || "Product Care";
  const description = p?.seo.description || p?.intro?.split("\n")[0] || META_DESCRIPTION;
  return withRouteSeo("/product-care", {
    title,
    description,
    alternates: { canonical: "/product-care" },
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

  const origin = canonicalOrigin();
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: origin },
      { "@type": "ListItem", position: 2, name: p.title, item: `${origin}/product-care` },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <ProductCareContent eyebrow={p.eyebrow} title={p.title} intro={p.intro} sections={p.sections} />
    </>
  );
}
