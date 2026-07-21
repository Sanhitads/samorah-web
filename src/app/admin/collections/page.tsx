import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listCollectionsAdmin } from "@/services/collectionAdminService";
import { CollectionsManager } from "@/components/admin/CollectionsManager";

/**
 * Collections / Chapters — `/admin/collections`. The Chapter CMS (review: the biggest architectural
 * gap). Manage the Volume → Chapter → Products hierarchy that structures the storefront: create/edit
 * chapters, their hero + editorial content + SEO, product ordering, and visibility. Editing needs
 * catalog.manage. Launching a new chapter no longer needs a developer.
 */
export const metadata: Metadata = { title: "Collections", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const collections = await listCollectionsAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Catalog · {staff.role}</p>
        <h1 className="admin__title">Collections &amp; Chapters</h1>
        <p className="admin__count">{collections.length} {collections.length === 1 ? "chapter" : "chapters"}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>

      {canManage ? (
        <CollectionsManager collections={collections} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Chapter</th><th>Volume</th><th>Products</th><th>Status</th></tr></thead>
            <tbody>{collections.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.volume ?? "—"}</td><td className="admin__mono">{c.productCount}</td><td>{c.isActive ? "active" : "draft"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
