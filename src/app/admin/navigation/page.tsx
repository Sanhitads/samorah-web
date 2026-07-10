import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getNavigationAdmin } from "@/services/navigationService";
import { NavigationManager } from "@/components/admin/NavigationManager";

/**
 * Navigation Manager — `/admin/navigation` (CMS slice 3). Edit the header mega-menu
 * + footer without code. Storefront reads DB→config fallback, so unsaved menus keep
 * rendering the code defaults. Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Navigation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NavigationPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const { branches, footer, headerSource, footerSource } = await getNavigationAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Navigation</h1>
        <p className="admin__count">Header {headerSource === "db" ? "· customised" : "· default"} · Footer {footerSource === "db" ? "· customised" : "· default"}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <NavigationManager branches={branches} footer={footer} headerSource={headerSource} footerSource={footerSource} />
      ) : (
        <p className="admin__empty">Editing navigation needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
