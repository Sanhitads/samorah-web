import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listProductsAdmin, getCategoriesForSelect, getCollectionsForSelect } from "@/services/productAdminService";
import { ProductsManager } from "@/components/admin/ProductsManager";

/**
 * Products — `/admin/products`. Catalog management: create/edit products + variants
 * (price/stock/active), publish, feature. Removes the "only editable via seed
 * script" blocker. Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Products", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");

  const [products, categories, collections] = await Promise.all([
    listProductsAdmin(),
    canManage ? getCategoriesForSelect() : Promise.resolve([]),
    canManage ? getCollectionsForSelect() : Promise.resolve([]),
  ]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Catalog · {staff.role}</p>
        <h1 className="admin__title">Products</h1>
        <p className="admin__count">{products.length} {products.length === 1 ? "product" : "products"}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>

      {canManage ? (
        <ProductsManager products={products} categories={categories} collections={collections} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td className="admin__mono">{p.baseSku}</td><td className="admin__mono">₹{p.price}</td><td className="admin__mono">{p.totalStock}</td><td>{p.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
