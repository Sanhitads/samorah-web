import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getReturnsQueue } from "@/services/returnService";
import { ReturnActions } from "@/components/admin/ReturnActions";
import { NewReturn } from "@/components/admin/NewReturn";

/**
 * Returns — `/admin/returns`. The integrative module: RMA lifecycle that issues refunds
 * as it settles and restores inventory through receipt-driven receiving & inspection
 * (SLP review point 9; Phase 1B-1). Operational transitions + receiving need
 * returns.operate; approve/reject/refund need returns.approve.
 */
export const metadata: Metadata = { title: "Returns", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested", under_review: "Under Review", approved: "Approved",
  return_required: "Return Required", in_transit: "In Transit", received: "Received",
  inspection: "Inspection", refund_processing: "Refund Processing", refunded: "Refunded",
  replacement_shipped: "Replacement Shipped", closed: "Closed", rejected: "Rejected",
};
const REASON_LABEL: Record<string, string> = {
  damaged: "Damaged", defective: "Defective", wrong_item: "Wrong item",
  not_as_described: "Not as described", changed_mind: "Changed mind",
};

export default async function ReturnsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canOperate = hasCapability(staff.role, "returns.operate");

  const rows = await getReturnsQueue();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Returns · {staff.role}</p>
        <h1 className="admin__title">Returns</h1>
        <div className="admin__headrow">
          <p className="admin__count">{rows.length} {rows.length === 1 ? "return" : "returns"}</p>
          {canOperate ? <NewReturn /> : null}
        </div>
      </header>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead>
            <tr>
              <th>RMA</th>
              <th>Order</th>
              <th>Reason</th>
              <th>Type</th>
              <th>Status</th>
              <th>Refund</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="admin__mono"><Link href={`/admin/returns/${r.id}`} className="od-link">{r.rma}</Link><div className="admin__muted">{r.itemCount} {r.itemCount === 1 ? "item" : "items"}</div></td>
                <td className="admin__mono">{r.orderNumber}</td>
                <td>{r.reason ? REASON_LABEL[r.reason] ?? r.reason : "—"}</td>
                <td className="admin__muted">{r.returnType}</td>
                <td><span className="ff-status" data-s={r.status}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                <td className="admin__mono">{r.refundAmount > 0 ? `₹${r.refundAmount.toFixed(2)}` : "—"}</td>
                <td>{canOperate ? <ReturnActions returnId={r.id} nextStates={r.nextStates} /> : <span className="admin__muted">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="admin__empty">No returns yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
