import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getNavigationAdmin } from "@/services/navigationService";
import { NavigationManager } from "@/components/admin/NavigationManager";

/**
 * Navigation Manager — `/admin/navigation` (CMS slice 3). A publishable resource:
 * edit a draft, preview it, then publish (or schedule). Header mega-menu + footer,
 * with revision history. Storefront reads the live tree (config fallback). Editing
 * needs catalog.manage.
 */
export const metadata: Metadata = { title: "Navigation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NavigationPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const { header, footer } = await getNavigationAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Navigation</h1>
        <p className="admin__count">Header · {header.state} · Footer · {footer.state}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <NavigationManager header={header} footer={footer} />
      ) : (
        <p className="admin__empty">Editing navigation needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
