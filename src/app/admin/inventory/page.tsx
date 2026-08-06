import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listInventory, inventorySummary, listUntrackedPhysical } from "@/services/inventoryService";
import { InventoryManager } from "@/components/admin/InventoryManager";

/**
 * Inventory — `/admin/inventory` (Phase 1A). Operational control surface over the canonical Phase-0
 * inventory. RBAC: inventory.view to see (manager+); inventory.adjust to mutate (admin+) — both
 * enforced server-side in /api/admin/inventory, not merely by hiding the button.
 */
export const metadata: Metadata = { title: "Inventory", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "inventory.view")) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">Operations · {staff.role}</p><h1 className="admin__title">Inventory</h1></header>
        <p className="admin__empty">Needs the inventory.view capability (manager+).</p>
      </main>
    );
  }
  const canAdjust = hasCapability(staff.role, "inventory.adjust");
  const [rows, untracked] = await Promise.all([listInventory(), Promise.resolve(listUntrackedPhysical())]);
  const summary = inventorySummary(rows, untracked.length);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Inventory</h1>
        <p className="admin__count">{summary.trackedVariants} tracked variants · {summary.lowStock} low · {summary.outOfStock} out{canAdjust ? "" : " · read-only (needs inventory.adjust to change)"}</p>
      </header>
      <InventoryManager rows={rows} summary={summary} untracked={untracked} canAdjust={canAdjust} />
    </main>
  );
}
