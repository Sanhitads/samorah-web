import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listCategoriesAdmin } from "@/services/categoryAdminService";
import { CategoryManager } from "@/components/admin/CategoryManager";

/**
 * Categories — `/admin/categories`. The catalog taxonomy CMS (review point 10). Manage the product
 * categories that seed SKU prefix + HSN + GST defaults (Candles, Room Spray, Linen Spray, Wax Tablet,
 * Diffuser…). Creating a category no longer needs the seed script. Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Categories", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const categories = await listCategoriesAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Catalog · {staff.role}</p>
        <h1 className="admin__title">Categories</h1>
        <p className="admin__count">{categories.length} {categories.length === 1 ? "category" : "categories"}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>

      {canManage ? (
        <CategoryManager categories={categories} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Category</th><th>SKU prefix</th><th>HSN</th><th>GST</th><th>Products</th><th>Status</th></tr></thead>
            <tbody>{categories.map((c) => <tr key={c.id}><td>{c.name}</td><td className="admin__mono">{c.skuPrefix}</td><td className="admin__mono">{c.defaultHsnCode}</td><td className="admin__mono">{c.defaultGstRate}%</td><td className="admin__mono">{c.productCount}</td><td>{c.isActive ? "active" : "inactive"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
