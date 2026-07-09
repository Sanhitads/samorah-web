import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff, ROLE_RANK } from "@/lib/auth/requireStaff";
import { getOrdersOverview } from "@/services/orderAdminService";
import { OrderActions } from "@/components/admin/OrderActions";

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

function paymentBadge(paymentStatus: string, isCod: boolean): { label: string; tone: string } {
  if (paymentStatus === "refunded") return { label: "Refunded", tone: "refunded" };
  if (paymentStatus === "partially_refunded") return { label: "Part. Refunded", tone: "refunded" };
  if (paymentStatus === "paid") return { label: "Paid", tone: "paid" };
  if (paymentStatus === "failed") return { label: "Failed", tone: "failed" };
  return { label: isCod ? "COD" : "Pending", tone: "pending" };
}

export default async function OrdersPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = (ROLE_RANK[staff.role ?? "customer"] ?? 0) >= ROLE_RANK.manager;

  const orders = await getOrdersOverview();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Order Management · {staff.role}</p>
        <h1 className="admin__title">Orders</h1>
        <p className="admin__count">
          {orders.length} {orders.length === 1 ? "order" : "orders"}
          {canManage ? "" : " · view only (cancel & refund need manager access)"}
        </p>
      </header>

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
              const badge = paymentBadge(o.paymentStatus, o.isCod);
              return (
                <tr key={o.orderNumber}>
                  <td className="admin__mono">{o.orderNumber}</td>
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
