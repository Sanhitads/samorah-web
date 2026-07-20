import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import {
  getOrdersOverview, getOrdersSummary, getStaffOptions, getCourierOptions,
  HIGH_VALUE_THRESHOLD, type OrderFilter,
} from "@/services/orderAdminService";
import { OrderActions } from "@/components/admin/OrderActions";
import { OrdersBulkProvider, OrderCheckbox } from "@/components/admin/OrdersBulk";
import { refundBadge } from "@/lib/fulfillment/derive";
import {
  orderAge, priorityBadge, paymentMethodLabel, opsFlags, fraudBadge, wholesaleBadge,
  SORT_OPTIONS, PRIORITY_FILTERS, PAYMENT_METHOD_FILTERS, DATE_RANGES, FRAUD_FILTERS, WHOLESALE_FILTERS,
  SAVED_VIEWS, savedViewHref, isViewActive, type OrderSort,
} from "@/lib/admin/orderList";

/**
 * Order Management — `/admin/orders`. The COMMERCIAL view of orders: status,
 * payment, refunds, and the manager-only cancel/refund actions (SLP principles
 * 7–9). Deliberately separate from the warehouse Fulfillment Board. Editors may
 * view; only manager+ see the action controls (defence-in-depth over the APIs).
 */
export const metadata: Metadata = { title: "Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing", packed: "Packed",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned", rto: "RTO",
};

function paymentBadge(paymentStatus: string, isCod: boolean, latestRefundStatus: string | null): { label: string; tone: string } {
  const rb = refundBadge(paymentStatus, latestRefundStatus);
  if (rb) return rb;
  if (paymentStatus === "paid") return { label: "Paid", tone: "paid" };
  if (paymentStatus === "failed") return { label: "Failed", tone: "failed" };
  return { label: isCod ? "COD" : "Pending", tone: "pending" };
}

const ORDER_STATUSES = ["pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned", "rto"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded"];

interface OrdersSearchParams {
  search?: string; status?: string; payment?: string; paymentMethod?: string;
  priority?: string; courier?: string; assignedTo?: string; tag?: string;
  gift?: string; range?: string; awaiting?: string; refundQueue?: string;
  needsAttention?: string; sort?: string; fraudReview?: string; wholesale?: string; hasIncident?: string;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  // Actions are per-capability: someone may cancel, refund, both, or neither.
  const canCancel = hasCapability(staff.role, "order.cancel");
  const canRefund = hasCapability(staff.role, "order.refund");
  const canManage = canCancel || canRefund;
  const canExport = hasCapability(staff.role, "data.export");

  const sp = await searchParams;
  const filter: OrderFilter = {
    search: sp.search, status: sp.status, payment: sp.payment, paymentMethod: sp.paymentMethod,
    priority: sp.priority, courier: sp.courier, assignedTo: sp.assignedTo, tag: sp.tag,
    gift: sp.gift === "1", range: sp.range, awaiting: sp.awaiting === "1",
    refundQueue: sp.refundQueue === "1", needsAttention: sp.needsAttention === "1",
    fraudReview: sp.fraudReview, wholesale: sp.wholesale, hasIncident: sp.hasIncident === "1",
    sort: sp.sort as OrderSort | undefined,
  };
  const [orders, summary, staffOptions, courierOptions] = await Promise.all([
    getOrdersOverview(filter),
    getOrdersSummary(filter),
    getStaffOptions(),
    getCourierOptions(),
  ]);

  const activeEntries = Object.entries(sp).filter(([, v]) => v) as [string, string][];
  const qs = new URLSearchParams(activeEntries).toString();
  const anyFilter = activeEntries.length > 0;
  const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const current = sp as Record<string, string | undefined>;
  // View-only params (set by saved views, not by the filter form) — carried through an Apply so a
  // user can refine WITHIN a view instead of dropping out of it.
  const passthrough: [string, string][] = ([["awaiting", sp.awaiting], ["refundQueue", sp.refundQueue], ["needsAttention", sp.needsAttention], ["tag", sp.tag]] as const)
    .filter(([, v]) => v) as [string, string][];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Order Management · {staff.role}</p>
        <h1 className="admin__title">Orders</h1>
        <p className="admin__count">
          {orders.length} shown{orders.length >= 100 ? " (first 100)" : ""}
          {canManage ? "" : " · view only (no cancel/refund capability)"}
        </p>
      </header>

      {/* Summary strip — numbers over EXACTLY the current filter (review point 10). */}
      <div className="oms-strip">
        <div className="oms-stat"><span className="oms-stat__n">{summary.count}{summary.capped ? "+" : ""}</span><span className="oms-stat__l">Orders</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{money(summary.revenue)}</span><span className="oms-stat__l">Revenue (paid)</span></div>
        <div className="oms-stat" data-tone={summary.pending ? "warn" : undefined}><span className="oms-stat__n">{summary.pending}</span><span className="oms-stat__l">Pending</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{summary.refunds}</span><span className="oms-stat__l">Refunded</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{summary.cancellations}</span><span className="oms-stat__l">Cancelled</span></div>
      </div>

      {/* Saved views — pure filter presets (review point 9). */}
      <div className="osv">
        {SAVED_VIEWS.map((v) => (
          <a key={v.key} href={savedViewHref(v)} className="osv__chip" data-active={isViewActive(v, current) ? "1" : undefined}>{v.label}</a>
        ))}
        {anyFilter ? <a href="/admin/orders" className="osv__chip osv__chip--clear">Clear all</a> : null}
      </div>

      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search order #, email, name…" />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <select name="payment" defaultValue={sp.payment ?? ""} aria-label="Payment status">
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="paymentMethod" defaultValue={sp.paymentMethod ?? ""} aria-label="Payment method">
          <option value="">Any method</option>
          {PAYMENT_METHOD_FILTERS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITY_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select name="courier" defaultValue={sp.courier ?? ""} aria-label="Courier">
          <option value="">Any courier</option>
          {courierOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="assignedTo" defaultValue={sp.assignedTo ?? ""} aria-label="Assigned staff">
          <option value="">Anyone</option>
          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="range" defaultValue={sp.range ?? ""} aria-label="Date range">
          <option value="">All time</option>
          {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select name="fraudReview" defaultValue={sp.fraudReview ?? ""} aria-label="Fraud review">
          <option value="">Any fraud state</option>
          <option value="any">Any flagged</option>
          {FRAUD_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select name="wholesale" defaultValue={sp.wholesale ?? ""} aria-label="Wholesale">
          <option value="">Any wholesale</option>
          <option value="any">Wholesale or B2B</option>
          {WHOLESALE_FILTERS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""} aria-label="Sort">
          <option value="">Sort: Newest</option>
          {SORT_OPTIONS.filter((s) => s.key !== "newest").map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
        </select>
        <label className="adm-filters__check"><input type="checkbox" name="gift" value="1" defaultChecked={sp.gift === "1"} /> Gift</label>
        <label className="adm-filters__check"><input type="checkbox" name="hasIncident" value="1" defaultChecked={sp.hasIncident === "1"} /> Incident</label>
        {passthrough.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {anyFilter ? <a href="/admin/orders" className="ff-btn">Clear</a> : null}
        {canExport ? <a className="ff-btn adm-filters__export" href={`/api/admin/orders/export${qs ? `?${qs}` : ""}`}>Export CSV</a> : null}
      </form>

      <OrdersBulkProvider
        pageNumbers={orders.map((o) => o.orderNumber)}
        filteredCount={summary.count}
        filter={filter as Record<string, unknown>}
        staff={staffOptions}
        canExport={canExport}
      >
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th className="obulk-th" aria-label="Select"></th>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              {canManage ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const badge = paymentBadge(o.paymentStatus, o.isCod, o.latestRefundStatus);
              const pri = priorityBadge(o.priority);
              const flags = opsFlags(o);
              const method = paymentMethodLabel(o.paymentMethod, o.isCod);
              const fraud = fraudBadge(o.fraudReview);
              const whole = wholesaleBadge(o.wholesale);
              return (
                <tr key={o.orderNumber}>
                  <td className="obulk-td"><OrderCheckbox orderNumber={o.orderNumber} /></td>
                  <td className="admin__mono">
                    <a href={`/admin/orders/${o.orderNumber}`} className="od-link">{o.orderNumber}</a>
                    <div className="adm-badges">
                      {pri ? <span className="adm-badge" data-b={pri.b}>{pri.label}</span> : null}
                      {o.total >= HIGH_VALUE_THRESHOLD ? <span className="adm-badge" data-b="high">High value</span> : null}
                      {o.hasGstin ? <span className="adm-badge" data-b="gst">GST</span> : null}
                      {flags.map((f) => <span key={f.f} className="adm-badge" data-b={f.f}>{f.label}</span>)}
                      {fraud ? <span className="adm-badge" data-b={fraud.b}>{fraud.label}</span> : null}
                      {whole ? <span className="adm-badge" data-b={whole.b}>{whole.label}</span> : null}
                      {o.hasIncident ? (o.incidentNumber
                        ? <a href={`/admin/incidents/${o.incidentNumber}`} className="adm-badge" data-b="incident">⚠ {o.incidentNumber}</a>
                        : <span className="adm-badge" data-b="incident">Incident</span>) : null}
                      {o.isCod ? <span className="adm-badge" data-b="cod">COD</span> : null}
                      {o.tags.map((t) => <span key={t} className="adm-badge">{t}</span>)}
                    </div>
                    <span className="oms-age">{orderAge(o.placedAt)}</span>
                  </td>
                  <td>
                    {o.customerName}
                    {o.assignedName ? <span className="oms-assignee">→ {o.assignedName}</span> : null}
                  </td>
                  <td>
                    <span className="ff-status" data-s={o.status}>{STATUS_LABEL[o.status] ?? o.status}</span>
                    {o.health.state !== "healthy" ? <span className="oh-badge oh-badge--sm" data-h={o.health.tone} title={o.health.reason}>{o.health.dot} {o.health.label}</span> : null}
                    {o.courierName ? <span className="oms-courier">{o.courierName}</span> : null}
                  </td>
                  <td>
                    <span className="om-pay" data-tone={badge.tone}>{badge.label}</span>
                    {method && method !== badge.label ? <span className="oms-method">{method}</span> : null}
                    {o.refundAmount > 0 ? <span className="admin__muted"> · ₹{o.refundAmount.toFixed(2)}</span> : null}
                  </td>
                  <td className="admin__mono">₹{o.total.toFixed(2)}</td>
                  {canManage ? (
                    <td>
                      <OrderActions
                        orderNumber={o.orderNumber}
                        status={o.status}
                        paymentStatus={o.paymentStatus}
                        paymentMethod={o.paymentMethod}
                        total={o.total}
                        refundAmount={o.refundAmount}
                        hasPayment={o.hasPayment}
                        canCancel={canCancel}
                        canRefund={canRefund}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {orders.length === 0 ? (
              <tr><td colSpan={canManage ? 7 : 6} className="admin__empty">No orders match this view.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </OrdersBulkProvider>
    </main>
  );
}
