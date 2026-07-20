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
 * Return detail — `/admin/returns/[id]`. The Resolution Center for one return: items, resolution
 * (+ colour-coded outcome and rationale), a derived finance summary, inspection, warehouse
 * disposition, damage grade, accountability (who did what), customer evidence, lifecycle actions,
 * and the return's audit timeline. Grouped into collapsible sections so the page scales. Staff view;
 * financial transitions stay gated at the API.
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

/** One accountability row: who owned a step + when. Renders only when there's a name to show. */
function Owner({ role, name, at }: { role: string; name?: string | null; at?: string | null }) {
  if (!name) return null;
  return (
    <div className="own-row">
      <span className="own-row__role">{role}</span>
      <span className="own-row__name">{name}</span>
      {at ? <span className="own-row__at admin__muted">{dt(at)}</span> : null}
    </div>
  );
}

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { id } = await params;
  const detail = await getReturnDetail(id);
  if (!detail) notFound();
  const { ret, items, attachments, finance } = detail;
  const timeline = await getReturnTimeline(id);
  const canOperate = hasCapability(staff.role, "returns.operate");
  const canApprove = hasCapability(staff.role, "returns.approve");
  const nextStates = nextReturnStates(ret.status as ReturnStatus);
  const hasInspOrWh = !!(ret.inspection_result || ret.warehouse_decision || ret.damage_classification);
  const gstLabel = finance.intraState ? "CGST+SGST" : "IGST";

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/returns" className="od-back">← Returns</Link></p>
        <h1 className="admin__title">{ret.rma_number ?? "Return"}</h1>
        <p className="admin__count">
          <span className="ff-status" data-s={ret.status}>{STATUS_LABEL[ret.status] ?? ret.status}</span>
          {ret.resolution ? <span className="res-badge" data-res={ret.resolution} style={{ marginLeft: 8 }}>{labelOf(RESOLUTIONS, ret.resolution)}</span> : null}
          {ret.damage_classification ? <span className="dmg-badge" data-dmg={ret.damage_classification} style={{ marginLeft: 8 }}>Damage: {labelOf(DAMAGE_GRADES, ret.damage_classification)}</span> : null}
          <span className="admin__muted"> · <Link href={`/admin/orders/${ret.order_number}`} className="text-link">{ret.order_number}</Link>{ret.reason ? ` · ${REASON_LABEL[ret.reason] ?? ret.reason}` : ""} · {ret.return_type}</span>
        </p>
      </header>

      {/* Resolution + finance */}
      <details className="od-group" open>
        <summary className="od-group__sum">Resolution &amp; finance</summary>
        <div className="od-grid">
          <section className="od-card">
            <h2 className="od-card__title">Resolution</h2>
            {ret.resolution ? (
              <p><span className="res-badge" data-res={ret.resolution}>{labelOf(RESOLUTIONS, ret.resolution)}</span></p>
            ) : <p className="admin__muted">Not decided yet.</p>}
            {ret.resolution_reason ? <p className="od-reason"><span className="od-reason__k">Reason</span> {ret.resolution_reason}</p> : (ret.resolution ? <p className="admin__muted om-field__hint">No reason recorded.</p> : null)}
            {ret.resolution_by_name ? <p className="admin__muted">by {ret.resolution_by_name} · {dt(ret.resolved_at)}</p> : null}
          </section>

          <section className="od-card od-card--finance">
            <h2 className="od-card__title">Finance</h2>
            <dl className="od-dl od-dl--fin">
              <div><dt>Customer paid</dt><dd>{inr(finance.customerPaid)}</dd></div>
              <div><dt>Returned goods value</dt><dd>{inr(finance.goodsValue)}</dd></div>
              <div>
                <dt>Refund</dt>
                <dd>{finance.refundAmount > 0 ? inr(finance.refundAmount) : "—"} {finance.refundAmount > 0 ? <span className={finance.refundIssued ? "fin-pill fin-pill--ok" : "fin-pill fin-pill--pend"}>{finance.refundIssued ? "issued" : "planned"}</span> : null}</dd>
              </div>
              {finance.refundAmount > 0 ? <div><dt className="admin__muted">— incl. GST ({gstLabel})</dt><dd className="admin__muted">{inr(finance.refundGst)}</dd></div> : null}
              <div><dt>Method</dt><dd>{labelOf(REFUND_METHODS, finance.refundMethod)}</dd></div>
              <div><dt>Refund id</dt><dd className="admin__mono">{finance.refundId ? String(finance.refundId).slice(0, 8) : "—"}</dd></div>
              <div><dt>Store credit</dt><dd>{finance.storeCredit > 0 ? inr(finance.storeCredit) : <span className="admin__muted">—</span>}</dd></div>
              <div><dt>Replacement value</dt><dd>{finance.replacementValue != null ? <>{inr(finance.replacementValue)} <span className="admin__muted">retail</span></> : <span className="admin__muted">—</span>}</dd></div>
              <div className="od-dl__net"><dt>Net cash out</dt><dd>{inr(finance.netCashOut)}</dd></div>
            </dl>
            <p className="om-field__hint">Reverse-logistics cost &amp; unit COGS aren&apos;t tracked — full cost/loss analytics is post-launch. GST split is derived from the order&apos;s effective inclusive rate.</p>
          </section>
        </div>

        {/* Accountability — who owned each step (priority 4) */}
        <section className="od-card">
          <h2 className="od-card__title">Accountability</h2>
          <div className="own">
            <Owner role="Requested" name={ret.created_by_name} at={ret.created_at} />
            <Owner role="Approved" name={ret.approved_by_name} at={ret.approved_at} />
            <Owner role="Resolution" name={ret.resolution_by_name} at={ret.resolved_at} />
            <Owner role="Inspection" name={ret.inspection_by_name} at={ret.inspected_at} />
            <Owner role="Warehouse" name={ret.warehouse_decision_by_name} at={ret.warehouse_decided_at} />
            <Owner role="Refund" name={ret.refund_by_name} at={ret.refund_at} />
            {!ret.created_by_name && !ret.approved_by_name && !ret.resolution_by_name && !ret.inspection_by_name && !ret.warehouse_decision_by_name && !ret.refund_by_name ? <p className="admin__muted">No owners recorded yet.</p> : null}
          </div>
        </section>
      </details>

      {/* Items */}
      <details className="od-group" open>
        <summary className="od-group__sum">Items <span className="count-badge">{items.length}</span></summary>
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
      </details>

      {/* Inspection + warehouse */}
      <details className="od-group" open={hasInspOrWh}>
        <summary className="od-group__sum">Inspection &amp; warehouse</summary>
        <div className="od-grid">
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
          <section className="od-card">
            <h2 className="od-card__title">Warehouse decision</h2>
            {ret.warehouse_decision ? (
              <>
                <p className="od-name">{labelOf(WAREHOUSE_DECISIONS, ret.warehouse_decision)}</p>
                {ret.warehouse_decision_by_name ? <p className="admin__muted">by {ret.warehouse_decision_by_name} · {dt(ret.warehouse_decided_at)}</p> : null}
              </>
            ) : <p className="admin__muted">No disposition yet.</p>}
            {ret.damage_classification ? <p><span className="dmg-badge" data-dmg={ret.damage_classification}>Damage: {labelOf(DAMAGE_GRADES, ret.damage_classification)}</span></p> : null}
          </section>
        </div>
      </details>

      {/* Evidence — gallery + admin upload + lightbox */}
      <details className="od-group" open={attachments.length > 0}>
        <summary className="od-group__sum">Customer evidence <span className="count-badge" data-empty={attachments.length === 0}>{attachments.length}</span></summary>
        <ReturnEvidence returnId={ret.id} attachments={attachments} canOperate={canOperate} bare />
      </details>

      {/* Notes */}
      <details className="od-group" open={!!(ret.notes || ret.customer_message)}>
        <summary className="od-group__sum">Notes</summary>
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
      </details>

      {/* Resolution-Center setters */}
      {canOperate || canApprove ? (
        <ReturnManage
          returnId={ret.id}
          canApprove={canApprove}
          canOperate={canOperate}
          current={{
            resolution: ret.resolution ?? "", resolutionReason: ret.resolution_reason ?? "", refundMethod: ret.refund_method ?? "",
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

      {/* Timeline (shared component, collapsed by default — reference) */}
      <details className="od-group">
        <summary className="od-group__sum">Return timeline <span className="count-badge">{timeline.length}</span></summary>
        <Timeline events={timeline} bare />
      </details>
    </main>
  );
}
