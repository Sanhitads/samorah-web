import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getShipmentsQueue } from "@/services/shipmentService";
import { ShipmentActions } from "@/components/admin/ShipmentActions";
import { CUSTOMER_STATUS_LABEL, type CustomerShipmentStatus } from "@/lib/shipment/state";

/**
 * Shipment Management — `/admin/shipments`. The post-dispatch lifecycle: track each
 * parcel through in-transit → out-for-delivery → delivered (POD + delivery email),
 * handle exceptions (NDR) and RTO. Manual updates today; a courier webhook feeds the
 * same lifecycle. Operational → fulfillment.operate gates the actions.
 */
export const metadata: Metadata = { title: "Shipments", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", ready_to_ship: "Ready to Ship", shipment_created: "Created",
  courier_assigned: "Courier Assigned", label_generated: "Label Generated", pickup_scheduled: "Pickup Scheduled",
  picked_up: "Picked Up", in_transit: "In Transit", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", rto: "RTO", cancelled: "Cancelled", exception: "Exception",
};

export default async function ShipmentsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canOperate = hasCapability(staff.role, "fulfillment.operate");

  const rows = await getShipmentsQueue();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Shipment Management · {staff.role}</p>
        <h1 className="admin__title">Shipments</h1>
        <p className="admin__count">{rows.length} {rows.length === 1 ? "shipment" : "shipments"}</p>
      </header>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead>
            <tr>
              <th>Order</th>
              <th>Provider / Courier</th>
              <th>AWB</th>
              <th>Status</th>
              <th>Weight / Cost</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="admin__mono">{s.orderNumber}</td>
                <td>
                  <div>{s.provider}</div>
                  {s.courierName ? <div className="admin__muted">{s.courierName}</div> : null}
                </td>
                <td className="admin__mono">
                  {s.trackingUrl && s.awb ? <a href={s.trackingUrl} target="_blank" rel="noreferrer">{s.awb}</a> : s.awb ?? "—"}
                  {s.labelUrl ? <div><a className="admin__muted" href={s.labelUrl} target="_blank" rel="noreferrer">label ↗</a></div> : null}
                </td>
                <td>
                  <span className="ff-status" data-s={s.status}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  <div className="admin__muted">{CUSTOMER_STATUS_LABEL[s.customerStatus as CustomerShipmentStatus] ?? s.customerStatus}</div>
                  {s.exceptionReason ? <div className="bc-inv" data-inv="missing">{s.exceptionReason}</div> : null}
                </td>
                <td className="admin__muted">
                  {s.chargeableWeightKg != null ? `${s.chargeableWeightKg} kg` : "—"}
                  {s.shippingCost != null ? <div>₹{s.shippingCost.toFixed(2)}</div> : null}
                </td>
                <td>
                  {canOperate ? (
                    <ShipmentActions
                      shipmentId={s.id}
                      status={s.status}
                      nextStates={s.nextStates}
                      hasLabel={Boolean(s.labelUrl)}
                      providerShipmentId={s.hasProviderShipmentId}
                    />
                  ) : <span className="admin__muted">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="admin__empty">No shipments yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
