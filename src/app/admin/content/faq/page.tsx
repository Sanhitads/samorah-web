import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * FAQ editor — `/admin/content/faq`. A deep-link into the existing Content (CMS) manager,
 * which switches to its FAQ mode (categories → questions) for this slug — same side-by-side
 * live preview, draft/schedule/publish, revisions, audit, and catalog.manage RBAC as every
 * other managed page. No parallel CMS.
 */
export const metadata: Metadata = { title: "FAQ", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FaqContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  if (!canManage) redirect("/admin/content"); // read-only users use the list view

  const [pages, site] = await Promise.all([listPagesAdmin(), getSiteSettings()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">FAQ</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/faq</span> page — categories, questions, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="faq" supportEmail={site.support.email} />
    </main>
  );
}
