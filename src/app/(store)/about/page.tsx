import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getAboutSections } from "@/services/aboutService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { getRouteSeo } from "@/services/seoRedirectService";

/**
 * About — consumer #2 of the Composable Page framework. Same engine, same shared
 * <ComposedSections> renderer, same reusable section types as the homepage — only
 * the page key and default composition differ. A new editorial page is a config.
 */
export const dynamic = "force-dynamic";

/** Metadata reads DB SEO overrides (slice 6) layered over global defaults. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getRouteSeo("/about");
  return {
    title: seo.title || "About",
    description: seo.description,
    openGraph: seo.ogImage ? { images: [seo.ogImage] } : undefined,
    robots: seo.robots || undefined,
  };
}

export default async function AboutPage() {
  let preview = false;
  const jar = await cookies();
  if (jar.get("ab_preview")) preview = (await requireStaff("editor")).ok;
  const sections = await getAboutSections({ preview });

  return (
    <main>
      {preview ? <div className="store-notice" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>Previewing draft About page — not live.</div> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
