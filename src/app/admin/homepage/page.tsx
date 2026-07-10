import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getHomepageAdmin, SECTION_META, SECTION_TYPES } from "@/services/homepageService";
import { HomepageManager } from "@/components/admin/HomepageManager";

/**
 * Homepage Builder — `/admin/homepage` (CMS slice 4). Compose the homepage from
 * typed sections: reorder, enable/disable, configure, then draft → preview →
 * publish (or schedule). A publishable resource with revision history. catalog.manage.
 */
export const metadata: Metadata = { title: "Homepage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function HomepageBuilderPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const view = await getHomepageAdmin();
  const meta = SECTION_TYPES.map((t) => ({ type: t, ...SECTION_META[t] }));

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Homepage Builder</h1>
        <p className="admin__count">{view.draft.length} sections · {view.state}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <HomepageManager view={view} sectionMeta={meta} />
      ) : (
        <p className="admin__empty">Editing the homepage needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
