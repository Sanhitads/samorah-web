import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getReturnDetail } from "@/services/returnService";
import { getReturnTimeline } from "@/services/auditService";
import { Timeline } from "@/components/admin/Timeline";
import { ReturnActions } from "@/components/admin/ReturnActions";
import { ReturnManage } from "@/components/admin/ReturnManage";
import { ReturnEvidence } from "@/components/admin/ReturnEvidence";
import { nextReturnStates, type ReturnStatus } from "@/lib/returns/state";
import { RESOLUTIONS, INSPECTION_RESULTS, WAREHOUSE_DECISIONS, DAMAGE_GRADES, REFUND_METHODS, labelOf } from "@/lib/returns/resolution";

/**
 * Return detail — `/admin/returns/[id]`. The Resolution Center for one return: items, resolution,
 * inspection, warehouse disposition, damage grade, refund method, internal + customer notes,
 * customer evidence, lifecycle actions, and the return's audit timeline (shared Timeline component).
 * Staff view; financial transitions stay gated at the API.
 */
export const metadata: Metadata = { title: "Return", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested", under_review: "Under Review", approved: "Approved",
  return_required: "Return Required", in_transit: "In Transit", received: "Received",
  inspection: "Inspection", refund_processing: "Refund Processing", refunded: "Refunded",
  replacement_shipped: "Replacement Shipped", closed: "Closed", rejected: "Rejected",
};
const REASON_LABEL: Record<string, string> = {
  damaged: "Damaged", wrong_item: "Wrong item", not_as_described: "Not as described",
  changed_mind: "Changed mind", defective: "Defective",
};

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { id } = await params;
  const detail = await getReturnDetail(id);
  if (!detail) notFound();
  const { ret, items, attachments } = detail;
  const timeline = await getReturnTimeline(id);
  const canOperate = hasCapability(staff.role, "returns.operate");
  const canApprove = hasCapability(staff.role, "returns.approve");
  const nextStates = nextReturnStates(ret.status as ReturnStatus);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/returns" className="od-back">← Returns</Link></p>
        <h1 className="admin__title">{ret.rma_number ?? "Return"}</h1>
        <p className="admin__count">
          <span className="ff-status" data-s={ret.status}>{STATUS_LABEL[ret.status] ?? ret.status}</span>
          {ret.resolution ? <span className="adm-badge" data-b="gst" style={{ marginLeft: 8 }}>{labelOf(RESOLUTIONS, ret.resolution)}</span> : null}
          {ret.damage_classification ? <span className="adm-badge" data-b="rush" style={{ marginLeft: 8 }}>Damage: {labelOf(DAMAGE_GRADES, ret.damage_classification)}</span> : null}
          <span className="admin__muted"> · <Link href={`/admin/orders/${ret.order_number}`} className="text-link">{ret.order_number}</Link>{ret.reason ? ` · ${REASON_LABEL[ret.reason] ?? ret.reason}` : ""} · {ret.return_type}</span>
        </p>
      </header>

      <div className="od-grid">
        {/* Resolution */}
        <section className="od-card">
          <h2 className="od-card__title">Resolution</h2>
          {ret.resolution ? (
            <p className="od-name">{labelOf(RESOLUTIONS, ret.resolution)}</p>
          ) : <p className="admin__muted">Not decided yet.</p>}
          {ret.resolution_by_name ? <p className="admin__muted">by {ret.resolution_by_name} · {dt(ret.resolved_at)}</p> : null}
        </section>

        {/* Money + method */}
        <section className="od-card">
          <h2 className="od-card__title">Refund</h2>
          <dl className="od-dl">
            <div><dt>Amount</dt><dd>{ret.refund_amount != null ? inr(ret.refund_amount) : "—"}</dd></div>
            <div><dt>Method</dt><dd>{labelOf(REFUND_METHODS, ret.refund_method)}</dd></div>
            <div><dt>Refund id</dt><dd className="admin__mono">{ret.refund_id ? String(ret.refund_id).slice(0, 8) : "—"}</dd></div>
          </dl>
        </section>
      </div>

      {/* Items */}
      <section className="od-section">
        <h2 className="od-card__title">Items ({items.length})</h2>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Line refund</th><th>Restock</th></tr></thead>
            <tbody>
              {(items as { id: string; product_name: string; sku: string | null; quantity: number; line_amount: number; restock: boolean }[]).map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td className="admin__muted">{it.sku ?? "—"}</td>
                  <td className="admin__mono">{it.quantity}</td>
                  <td className="admin__mono">{inr(it.line_amount)}</td>
                  <td>{it.restock ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="od-grid">
        {/* Inspection */}
        <section className="od-card">
          <h2 className="od-card__title">Inspection</h2>
          {ret.inspection_result ? (
            <>
              <p className="od-name">{labelOf(INSPECTION_RESULTS, ret.inspection_result)}</p>
              {ret.inspection_note ? <p className="admin__muted">{ret.inspection_note}</p> : null}
              {ret.inspection_by_name ? <p className="admin__muted">by {ret.inspection_by_name} · {dt(ret.inspected_at)}</p> : null}
            </>
          ) : <p className="admin__muted">Not inspected yet.</p>}
        </section>

        {/* Warehouse decision */}
        <section className="od-card">
          <h2 className="od-card__title">Warehouse decision</h2>
          {ret.warehouse_decision ? (
            <>
              <p className="od-name">{labelOf(WAREHOUSE_DECISIONS, ret.warehouse_decision)}</p>
              {ret.warehouse_decision_by_name ? <p className="admin__muted">by {ret.warehouse_decision_by_name} · {dt(ret.warehouse_decided_at)}</p> : null}
            </>
          ) : <p className="admin__muted">No disposition yet.</p>}
        </section>
      </div>

      {/* Evidence — gallery + admin upload + lightbox */}
      <ReturnEvidence returnId={ret.id} attachments={attachments} canOperate={canOperate} />

      {/* Notes */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Internal note</h2>
          <p className={ret.notes ? "" : "admin__muted"}>{ret.notes || "None."}</p>
        </section>
        <section className="od-card">
          <h2 className="od-card__title">Customer message</h2>
          <p className={ret.customer_message ? "" : "admin__muted"}>{ret.customer_message || "None."}</p>
        </section>
      </div>

      {/* Resolution-Center setters */}
      {canOperate || canApprove ? (
        <ReturnManage
          returnId={ret.id}
          canApprove={canApprove}
          canOperate={canOperate}
          current={{
            resolution: ret.resolution ?? "", refundMethod: ret.refund_method ?? "",
            inspectionResult: ret.inspection_result ?? "", inspectionNote: ret.inspection_note ?? "",
            warehouseDecision: ret.warehouse_decision ?? "", damage: ret.damage_classification ?? "",
            internalNote: ret.notes ?? "", customerMessage: ret.customer_message ?? "",
          }}
        />
      ) : null}

      {/* Lifecycle actions */}
      {canOperate ? (
        <section className="od-section">
          <h2 className="od-card__title">Lifecycle</h2>
          <ReturnActions returnId={ret.id} nextStates={nextStates} />
        </section>
      ) : null}

      {/* Timeline (shared component) */}
      <Timeline events={timeline} title="Return timeline" />
    </main>
  );
}
