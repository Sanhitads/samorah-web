import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getOrdersOverview, HIGH_VALUE_THRESHOLD } from "@/services/orderAdminService";
import { OrderActions } from "@/components/admin/OrderActions";
import { refundBadge } from "@/lib/fulfillment/derive";

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

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; payment?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  // Actions are per-capability: someone may cancel, refund, both, or neither.
  const canCancel = hasCapability(staff.role, "order.cancel");
  const canRefund = hasCapability(staff.role, "order.refund");
  const canManage = canCancel || canRefund;
  const canExport = hasCapability(staff.role, "data.export");

  const sp = await searchParams;
  const filter = { search: sp.search, status: sp.status, payment: sp.payment };
  const orders = await getOrdersOverview(filter);
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Order Management · {staff.role}</p>
        <h1 className="admin__title">Orders</h1>
        <p className="admin__count">
          {orders.length} {orders.length === 1 ? "order" : "orders"}
          {canManage ? "" : " · view only (no cancel/refund capability)"}
        </p>
      </header>

      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search order #, email, name…" />
        <select name="status" defaultValue={sp.status ?? ""}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <select name="payment" defaultValue={sp.payment ?? ""}>
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {sp.search || sp.status || sp.payment ? <a href="/admin/orders" className="ff-btn">Clear</a> : null}
        {canExport ? <a className="ff-btn adm-filters__export" href={`/api/admin/orders/export${qs ? `?${qs}` : ""}`}>Export CSV</a> : null}
      </form>

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
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
              return (
                <tr key={o.orderNumber}>
                  <td className="admin__mono">
                    <a href={`/admin/orders/${o.orderNumber}`} className="od-link">{o.orderNumber}</a>
                    <div className="adm-badges">
                      {o.total >= HIGH_VALUE_THRESHOLD ? <span className="adm-badge" data-b="high">High value</span> : null}
                      {o.hasGstin ? <span className="adm-badge" data-b="gst">GST</span> : null}
                      {o.isGift ? <span className="adm-badge" data-b="gift">Gift</span> : null}
                      {o.isCod ? <span className="adm-badge" data-b="cod">COD</span> : null}
                      {o.tags.map((t) => <span key={t} className="adm-badge">{t}</span>)}
                    </div>
                  </td>
                  <td>{o.customerName}</td>
                  <td><span className="ff-status" data-s={o.status}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                  <td>
                    <span className="om-pay" data-tone={badge.tone}>{badge.label}</span>
                    {o.refundAmount > 0 ? <span className="admin__muted"> · ₹{o.refundAmount.toFixed(2)}</span> : null}
                  </td>
                  <td className="admin__mono">₹{o.total.toFixed(2)}</td>
                  {canManage ? (
                    <td>
                      <OrderActions
                        orderNumber={o.orderNumber}
                        status={o.status}
                        paymentStatus={o.paymentStatus}
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
              <tr><td colSpan={canManage ? 6 : 5} className="admin__empty">No orders yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
