import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getFulfillmentQueue, getQueueCounts } from "@/services/fulfillmentService";
import { FulfillmentActions } from "@/components/admin/FulfillmentActions";
import { PriorityControl, AssigneeControl, TagsControl } from "@/components/admin/BoardControls";
import { WORK_QUEUES, refundBadge, type WorkQueue, type EffectivePriority } from "@/lib/fulfillment/derive";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";

/**
 * Fulfillment dashboard — `/admin/fulfillment`. Staff (editor+) drive orders through
 * pick → pack → QC → ready → create shipment → dispatch. Rows carry the triage
 * context an operator reads without interpreting (SLP 11–17 + review refinements):
 * effective priority, next action, work queue, refined inventory + refund states.
 */
export const metadata: Metadata = { title: "Fulfillment", robots: { index: false } };
export const dynamic = "force-dynamic";

const FS_LABEL: Record<FulfillmentStatus, string> = {
  reserved: "Reserved", picking: "Picking", picked: "Picked", packing: "Packing", packed: "Packed",
  qc_passed: "QC Passed", qc_failed: "QC Failed", ready_for_dispatch: "Ready for Dispatch",
  courier_assigned: "Courier Assigned", picked_up: "Picked Up", shipped: "Shipped",
  on_hold: "On Hold", cancelled: "Cancelled",
};
const EFF_LABEL: Record<EffectivePriority, string> = { critical: "Critical", high: "High", normal: "Normal" };
const INV_LABEL: Record<string, string> = { reserved: "Reserved", allocated: "Allocated", picking: "Picking", missing: "Missing Stock", backordered: "Backordered", unknown: "—" };

/** Base payment badge; a refund sub-state (point 4) overrides it when present. */
function paymentBadge(paymentStatus: string, isCod: boolean, latestRefundStatus: string | null): { label: string; tone: string } {
  const rb = refundBadge(paymentStatus, latestRefundStatus);
  if (rb) return rb;
  if (paymentStatus === "paid") return { label: isCod ? "COD Paid" : "Paid", tone: "paid" };
  if (paymentStatus === "failed") return { label: "Failed", tone: "failed" };
  return { label: isCod ? "COD" : "Pending", tone: "pending" };
}

function sla(placedAt: string, now: number): string {
  const hrs = Math.max(0, (now - new Date(placedAt).getTime()) / 3.6e6);
  return hrs < 1 ? "just now" : hrs < 24 ? `${Math.floor(hrs)}h` : `${Math.floor(hrs / 24)}d`;
}

export default async function FulfillmentDashboard({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");

  const sp = await searchParams;
  const queue = (WORK_QUEUES.find((q) => q.key === sp.queue)?.key ?? undefined) as WorkQueue | undefined;
  const [rows, counts] = await Promise.all([getFulfillmentQueue({ queue }), getQueueCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const now = Date.now();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Fulfillment · {staff.role}</p>
        <h1 className="admin__title">Fulfillment Queue</h1>
        <p className="admin__count">{rows.length} {rows.length === 1 ? "order" : "orders"}{queue ? ` in ${WORK_QUEUES.find((q) => q.key === queue)?.label}` : ""} · sorted by priority</p>
      </header>

      <nav className="ff-queues" aria-label="Work queues">
        <Link href="/admin/fulfillment" className="ff-queue" data-active={!queue ? "1" : "0"}>All <span className="ff-queue__n">{total}</span></Link>
        {WORK_QUEUES.map((q) => (
          <Link key={q.key} href={`/admin/fulfillment?queue=${q.key}`} className="ff-queue" data-active={queue === q.key ? "1" : "0"} data-q={q.key}>
            {q.label} <span className="ff-queue__n">{counts[q.key]}</span>
          </Link>
        ))}
      </nav>

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
            {rows.map((r) => {
              const pay = paymentBadge(r.paymentStatus, r.isCod, r.latestRefundStatus);
              return (
                <tr key={r.orderNumber}>
                  <td>
                    <span className="bc-eff" data-p={r.effectivePriority}>{EFF_LABEL[r.effectivePriority]}</span>
                    <div className="bc-eff-set"><PriorityControl orderNumber={r.orderNumber} priority={r.priority} /></div>
                  </td>
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
                    <div className="bc-next">→ {r.nextAction}</div>
                    <div className="bc-inv" data-inv={r.inventory}>{INV_LABEL[r.inventory]}</div>
                    {r.shipmentStatus ? <div className="admin__muted">{r.shipmentStatus}{r.awb ? ` · ${r.awb}` : ""}</div> : null}
                  </td>
                  <td>
                    <span className="om-pay" data-tone={pay.tone}>{pay.label}</span>
                    {r.refundAmount > 0 ? <div className="admin__muted">₹{r.refundAmount.toFixed(2)}</div> : null}
                  </td>
                  <td><span className="bc-sla" data-tone={r.slaTone}>{sla(r.placedAt, now)}</span></td>
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
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="admin__empty">No orders in this queue.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
