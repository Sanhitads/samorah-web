import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getJournalSections } from "@/services/journalService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ComposedSections } from "@/components/page/ComposedSections";
import { withRouteSeo } from "@/services/seoRedirectService";

/** Journal — consumer #3 of the Composable Page framework. Identical wiring to About. */
export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => withRouteSeo("/journal", { title: "Journal" });

export default async function JournalPage() {
  let preview = false;
  const jar = await cookies();
  if (jar.get("jn_preview")) preview = (await requireStaff("editor")).ok;
  const sections = await getJournalSections({ preview });

  return (
    <main>
      {preview ? <div className="store-notice" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>Previewing draft Journal — not live.</div> : null}
      <ComposedSections sections={sections} />
    </main>
  );
}
