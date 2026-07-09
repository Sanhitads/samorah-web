import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getWarehouseAdminView } from "@/services/warehouseAdminService";
import { WarehousesManager } from "@/components/admin/WarehousesManager";

/**
 * Warehouses — `/admin/warehouses`. Pickup locations + order→warehouse routing
 * (coverage §G). What's set here decides the pickup on every shipment: region
 * routing prefers a warehouse serving the delivery state, else the highest-priority
 * active one. Editing needs shipping.configure.
 */
export const metadata: Metadata = { title: "Warehouses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "shipping.configure");

  const { warehouses, defaultWarehouseId } = await getWarehouseAdminView();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Configuration · {staff.role}</p>
        <h1 className="admin__title">Warehouses</h1>
        <p className="admin__count">{warehouses.length} {warehouses.length === 1 ? "location" : "locations"}{canManage ? "" : " · read-only (needs shipping.configure)"}</p>
      </header>

      {canManage ? (
        <WarehousesManager warehouses={warehouses} defaultWarehouseId={defaultWarehouseId} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>ID</th><th>Name</th><th>Location</th><th>Serves</th><th>Status</th></tr></thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id}>
                  <td className="admin__mono">{w.id}{w.id === defaultWarehouseId ? " (default)" : ""}</td>
                  <td>{w.name}</td>
                  <td className="admin__muted">{[w.address.city, w.address.state].filter(Boolean).join(", ")}</td>
                  <td className="admin__muted">{w.servesStates.length ? w.servesStates.join(", ") : "anywhere"}</td>
                  <td>{w.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
