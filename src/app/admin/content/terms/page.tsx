import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Terms & Conditions editor — `/admin/content/terms`. A deep-link into the existing
 * Content (CMS) manager that opens the `terms` page straight away, with the same
 * side-by-side live preview, audit, and revision path as every other managed page —
 * no parallel CMS. Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Terms & Conditions", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TermsContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  if (!canManage) redirect("/admin/content"); // read-only users use the list view

  const [pages, site] = await Promise.all([listPagesAdmin(), getSiteSettings()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Terms & Conditions</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/terms</span> page — draft, schedule, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="terms" supportEmail={site.support.email} />
    </main>
  );
}
