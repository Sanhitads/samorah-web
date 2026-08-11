import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Content (CMS) — `/admin/content`. Edit storefront pages (policies, info, about…)
 * without code. Config-only pages appear as "seedable" — editing one writes a CMS
 * row that overrides it. Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Content", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");

  const [pages, site] = await Promise.all([listPagesAdmin(), getSiteSettings()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Pages</h1>
        <p className="admin__count">{pages.length} pages{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <ContentManager pages={pages} supportEmail={site.support.email} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Slug</th><th>Title</th><th>Source</th></tr></thead>
            <tbody>{pages.map((p) => <tr key={p.slug}><td className="admin__mono">/{p.slug}</td><td>{p.title}</td><td>{p.source}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
