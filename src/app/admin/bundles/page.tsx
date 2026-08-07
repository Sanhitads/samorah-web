import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getBundleAdmin } from "@/services/bundleAdminService";
import { getBundleCandles } from "@/services/bundleService";
import { resolveBundleMedia } from "@/services/bundlePageService";
import { BundleEditor } from "@/components/admin/BundleEditor";

/**
 * Bundle Page CMS — `/admin/bundles`. Side-by-side editor + live preview of the real Bundle page.
 * View/edit gated by content.edit; live-changing actions require content.publish (server-enforced in the
 * API). Loads the editable draft + published + eligible candles + resolved media, then hands them to the
 * client editor which renders the shared BundlePageView with the ephemeral preview controller.
 */
export const metadata: Metadata = { title: "Bundle Page", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminBundlesPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "content.edit")) {
    return (
      <main className="admin">
        <header className="admin__head"><h1 className="admin__title">Bundle Page</h1></header>
        <p className="admin__empty">You need the <code>content.edit</code> capability to manage the Bundle page.</p>
      </main>
    );
  }

  const [state, candles] = await Promise.all([getBundleAdmin(), getBundleCandles().catch(() => [])]);
  // Resolve media referenced by draft + published so both edit and preview can render images immediately.
  const [draftMedia, publishedMedia] = await Promise.all([
    resolveBundleMedia(state.draft),
    state.published ? resolveBundleMedia(state.published) : Promise.resolve({}),
  ]);
  const mediaUrls = { ...publishedMedia, ...draftMedia };

  return (
    <BundleEditor
      initial={state}
      candles={candles}
      mediaUrls={mediaUrls}
      canPublish={hasCapability(staff.role, "content.publish")}
    />
  );
}
