import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getNavigationAdmin, listLinkableEntities } from "@/services/navigationService";
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
  // RBAC split (point 9): content.edit to prepare drafts; content.publish to change the live storefront.
  const canEdit = hasCapability(staff.role, "content.edit");
  const canPublish = hasCapability(staff.role, "content.publish");
  const [{ header, footer }, entities] = await Promise.all([getNavigationAdmin(), listLinkableEntities()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Navigation</h1>
        <p className="admin__count">Header · {header.state} · Footer · {footer.state}{canEdit ? (canPublish ? "" : " · draft-only (needs content.publish to go live)") : " · read-only (needs content.edit)"}</p>
      </header>
      {canEdit ? (
        <NavigationManager header={header} footer={footer} entities={entities} canPublish={canPublish} />
      ) : (
        <p className="admin__empty">Editing navigation needs the content.edit capability.</p>
      )}
    </main>
  );
}
