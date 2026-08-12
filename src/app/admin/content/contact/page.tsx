import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Contact editor — `/admin/content/contact`. Deep-link into the existing ContentManager: the
 * editorial blocks are ordinary sections, plus a Contact-form config block and a faithful preview.
 * Contact methods / hours / studio / social come from Site Settings (edited there, single source).
 */
export const metadata: Metadata = { title: "Contact", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ContactContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  if (!canManage) redirect("/admin/content");

  const [pages, site] = await Promise.all([listPagesAdmin(), getSiteSettings()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Contact</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/contact</span> page — content, form config, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="contact" supportEmail={site.support.email} contact={{ support: site.support, social: site.social }} />
    </main>
  );
}
