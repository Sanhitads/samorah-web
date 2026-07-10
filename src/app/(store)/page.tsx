import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getHomepageSections } from "@/services/homepageService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Homepage — consumer #1 of the Composable Page framework. Composition + content are
 * DB-driven via the Homepage Builder; the shared <ComposedSections> renders the
 * typed section list (config fallback). Staff-gated draft preview via cookie.
 */
export const dynamic = "force-dynamic";

/** Homepage metadata reads DB SEO overrides (path "/") over the site defaults. */
export function generateMetadata(): Promise<Metadata> {
  return withRouteSeo("/", {});
}

export default async function HomePage() {
  let preview = false;
  const jar = await cookies();
  if (jar.get("hp_preview")) preview = (await requireStaff("editor")).ok;
  const sections = await getHomepageSections({ preview });

  return (
    <main>
      {preview ? <div className="store-notice" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>Previewing draft homepage — not live.</div> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
