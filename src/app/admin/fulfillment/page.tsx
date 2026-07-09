import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getFulfillmentQueue } from "@/services/fulfillmentService";
import { FulfillmentActions } from "@/components/admin/FulfillmentActions";
import { PriorityControl, AssigneeControl, TagsControl } from "@/components/admin/BoardControls";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";

/**
 * Fulfillment dashboard — `/admin/fulfillment`. Staff (editor+) drive orders through
 * the physical workflow: pick → pack → QC → ready → create shipment → dispatch. The
 * middleware gates the path; we re-check the role here (defence-in-depth). Each row
 * carries the triage context an operator needs (SLP 11–17): priority, tags, item
 * count, payment, SLA age, owner, notes, inventory.
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

function paymentBadge(paymentStatus: string, isCod: boolean): { label: string; tone: string } {
  if (paymentStatus === "refunded") return { label: "Refunded", tone: "refunded" };
  if (paymentStatus === "partially_refunded") return { label: "Part. Refund", tone: "refunded" };
  if (paymentStatus === "paid") return { label: isCod ? "COD Paid" : "Paid", tone: "paid" };
  if (paymentStatus === "failed") return { label: "Failed", tone: "failed" };
  return { label: isCod ? "COD" : "Pending", tone: "pending" };
}

/** SLA (14): order age, colour-coded. Reference time passed in so the render is stable. */
function sla(placedAt: string, now: number): { label: string; tone: string } {
  const hrs = Math.max(0, (now - new Date(placedAt).getTime()) / 3.6e6);
  const label = hrs < 1 ? "just now" : hrs < 24 ? `${Math.floor(hrs)}h` : `${Math.floor(hrs / 24)}d`;
  const tone = hrs >= 48 ? "over" : hrs >= 24 ? "warn" : "ok";
  return { label, tone };
}

const INV_LABEL: Record<string, string> = { allocated: "Allocated", missing: "Missing Stock", unknown: "—" };

export default async function FulfillmentDashboard() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");

  const queue = await getFulfillmentQueue();
  const now = Date.now();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Fulfillment · {staff.role}</p>
        <h1 className="admin__title">Fulfillment Queue</h1>
        <p className="admin__count">{queue.length} {queue.length === 1 ? "order" : "orders"} · sorted by priority</p>
      </header>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Fulfillment</th>
              <th>Payment</th>
              <th>Age</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r) => {
              const pay = paymentBadge(r.paymentStatus, r.isCod);
              const age = sla(r.placedAt, now);
              return (
                <tr key={r.orderNumber}>
                  <td><PriorityControl orderNumber={r.orderNumber} priority={r.priority} /></td>
                  <td>
                    <div className="bc-order">
                      <span className="admin__mono">{r.orderNumber}</span>
                      <span className="admin__muted">{r.itemCount} {r.itemCount === 1 ? "item" : "items"}</span>
                    </div>
                    <TagsControl orderNumber={r.orderNumber} tags={r.tags} />
                    {r.note ? <div className="bc-note" title={r.note}>📝 {r.note}</div> : null}
                  </td>
                  <td>{r.customerName}</td>
                  <td>
                    <span className="ff-status" data-s={r.fulfillmentStatus}>{FS_LABEL[r.fulfillmentStatus] ?? r.fulfillmentStatus}</span>
                    <div className="bc-inv" data-inv={r.inventory}>{INV_LABEL[r.inventory]}</div>
                    {r.shipmentStatus ? <div className="admin__muted">{r.shipmentStatus}{r.awb ? ` · ${r.awb}` : ""}</div> : null}
                  </td>
                  <td>
                    <span className="om-pay" data-tone={pay.tone}>{pay.label}</span>
                    {r.refundAmount > 0 ? <div className="admin__muted">₹{r.refundAmount.toFixed(2)}</div> : null}
                  </td>
                  <td><span className="bc-sla" data-tone={age.tone}>{age.label}</span></td>
                  <td><AssigneeControl orderNumber={r.orderNumber} assigneeName={r.assigneeName} /></td>
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
              );
            })}
            {queue.length === 0 ? (
              <tr><td colSpan={8} className="admin__empty">No orders in the fulfillment queue.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
