import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getFulfillmentQueue } from "@/services/fulfillmentService";
import { FulfillmentActions } from "@/components/admin/FulfillmentActions";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";

/**
 * Fulfillment dashboard — `/admin/fulfillment`. Staff (editor+) drive orders through
 * the physical workflow: pick → pack → QC → ready → create shipment → dispatch. The
 * middleware gates the path; we re-check the role here (defence-in-depth).
 */
export const metadata: Metadata = { title: "Fulfillment", robots: { index: false } };
export const dynamic = "force-dynamic";

const FS_LABEL: Record<FulfillmentStatus, string> = {
  reserved: "Reserved",
  picking: "Picking",
  picked: "Picked",
  packing: "Packing",
  packed: "Packed",
  qc_passed: "QC Passed",
  qc_failed: "QC Failed",
  ready_for_dispatch: "Ready for Dispatch",
  courier_assigned: "Courier Assigned",
  picked_up: "Picked Up",
  shipped: "Shipped",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

export default async function FulfillmentDashboard() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");

  const queue = await getFulfillmentQueue();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Fulfillment · {staff.role}</p>
        <h1 className="admin__title">Fulfillment Queue</h1>
        <p className="admin__count">{queue.length} {queue.length === 1 ? "order" : "orders"}</p>
      </header>

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Fulfillment</th>
              <th>Order</th>
              <th>Shipment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r) => (
              <tr key={r.orderNumber}>
                <td className="admin__mono">{r.orderNumber}</td>
                <td>{r.customerName}</td>
                <td><span className="ff-status" data-s={r.fulfillmentStatus}>{FS_LABEL[r.fulfillmentStatus] ?? r.fulfillmentStatus}</span></td>
                <td className="admin__muted">{r.orderStatus}</td>
                <td className="admin__muted">{r.shipmentStatus ? `${r.shipmentStatus}${r.awb ? ` · ${r.awb}` : ""}` : "—"}</td>
                <td>
                  <FulfillmentActions
                    orderNumber={r.orderNumber}
                    fulfillmentStatus={r.fulfillmentStatus}
                    nextStates={r.nextStates}
                    shipmentStatus={r.shipmentStatus}
                    holdReason={r.holdReason}
                  />
                </td>
              </tr>
            ))}
            {queue.length === 0 ? (
              <tr><td colSpan={6} className="admin__empty">No orders in the fulfillment queue.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
