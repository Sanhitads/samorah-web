import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getOrderByNumber } from "@/services/orderService";
import { getOrderRefunds } from "@/services/refundService";
import { getOrderNotifications } from "@/services/notificationService";
import { getOrderTimeline } from "@/services/auditService";
import { hasCapability } from "@/lib/auth/capabilities";
import { OrderMeta } from "@/components/admin/OrderMeta";
import { RefundRetryBanner } from "@/components/admin/RefundRetryBanner";

/**
 * Order detail — `/admin/orders/[orderNumber]`. The single pane of glass for one
 * order: money, addresses, items, refunds, customer notifications, and the full
 * immutable audit timeline (realizes the audit stream + refund/notification logs
 * that had no UI). Staff view; commercial actions stay on the list/detail actions.
 */
export const metadata: Metadata = { title: "Order", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { orderNumber } = await params;

  const order = (await getOrderByNumber(orderNumber)) as any;
  if (!order) notFound();

  const [refunds, notifications, timeline] = await Promise.all([
    getOrderRefunds(order.id),
    getOrderNotifications(order.id),
    getOrderTimeline(order.id),
  ]);
  const items = (order.order_items ?? []) as any[];
  const failedRefunds = (refunds as any[]).filter((r) => r.status === "failed");
  const failedRefund = failedRefunds[0];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/orders" className="od-back">← Orders</Link></p>
        <h1 className="admin__title">{order.order_number}</h1>
        <p className="admin__count">
          <span className="ff-status" data-s={order.status}>{order.status}</span>
          <span className="om-pay" data-tone={order.payment_status === "paid" ? "paid" : order.payment_status?.includes("refund") ? "refunded" : "pending"} style={{ marginLeft: 8 }}>{order.payment_status}</span>
          <span className="admin__muted"> · placed {dt(order.placed_at)}{order.invoice_number ? ` · Invoice ${order.invoice_number}` : ""}</span>
        </p>
      </header>

      {failedRefund ? (
        <RefundRetryBanner
          orderNumber={order.order_number}
          reason={failedRefund.error_description || failedRefund.reason || "Gateway error"}
          attemptedAt={failedRefund.created_at}
          amount={Number(failedRefund.amount ?? 0)}
          gateway={failedRefund.method === "manual" ? "Manual" : "Razorpay"}
          refundId={failedRefund.razorpay_refund_id ?? null}
          attempts={failedRefunds.length}
        />
      ) : null}

      <div className="od-grid">
        {/* Money */}
        <section className="od-card">
          <h2 className="od-card__title">Payment</h2>
          <dl className="od-dl">
            <div><dt>Subtotal</dt><dd>{inr(order.subtotal)}</dd></div>
            {Number(order.discount_amount) > 0 ? <div><dt>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt><dd>−{inr(order.discount_amount)}</dd></div> : null}
            {Number(order.shipping_amount) > 0 ? <div><dt>Shipping</dt><dd>{inr(order.shipping_amount)}</dd></div> : null}
            <div><dt>GST</dt><dd>{inr(Number(order.cgst_amount) + Number(order.sgst_amount) + Number(order.igst_amount))}</dd></div>
            <div className="od-dl__grand"><dt>Total</dt><dd>{inr(order.total_amount)}</dd></div>
            {Number(order.refund_amount) > 0 ? <div><dt>Refunded</dt><dd>−{inr(order.refund_amount)}</dd></div> : null}
            <div><dt>Method</dt><dd>{order.payment_method ?? "—"}</dd></div>
          </dl>
        </section>

        {/* Customer + addresses */}
        <section className="od-card">
          <h2 className="od-card__title">Customer</h2>
          <p className="od-name">{order.ship_full_name}</p>
          <p className="admin__muted">{order.email}{order.ship_phone ? ` · ${order.ship_phone}` : ""}</p>
          {order.buyer_gstin ? <p className="admin__muted">GSTIN {order.buyer_gstin}{order.buyer_company ? ` · ${order.buyer_company}` : ""}</p> : null}
          <p className="od-addr">{order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ""}, {order.ship_city}, {order.ship_state} {order.ship_pincode}</p>
        </section>
      </div>

      {/* Items */}
      <section className="od-section">
        <h2 className="od-card__title">Items ({items.length})</h2>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Product</th><th>SKU / HSN</th><th>Qty</th><th>Line total</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}{it.variant_name ? <span className="admin__muted"> · {it.variant_name}</span> : it.vessel ? <span className="admin__muted"> · {it.vessel} {it.size}</span> : null}</td>
                  <td className="admin__muted">{it.sku}{it.hsn_code ? ` · HSN ${it.hsn_code}` : ""}</td>
                  <td className="admin__mono">{it.quantity}</td>
                  <td className="admin__mono">{inr(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="od-grid">
        {/* Refunds */}
        <section className="od-card" id="refunds" style={{ scrollMarginTop: 20 }}>
          <h2 className="od-card__title">Refunds ({refunds.length})</h2>
          {refunds.length ? refunds.map((r) => (
            <div key={r.id} className="od-line"><span>{inr(r.amount)} · {r.method}</span><span className="om-pay" data-tone={r.status === "processed" ? "paid" : r.status === "failed" ? "failed" : "refundprog"}>{r.status}</span><span className="admin__muted">{dt(r.created_at)}</span></div>
          )) : <p className="admin__muted">No refunds.</p>}
        </section>

        {/* Internal: tags + note + resend */}
        {hasCapability(staff.role, "fulfillment.triage") ? (
          <OrderMeta orderId={order.id} note={order.ops_note ?? null} tags={Array.isArray(order.ops_tags) ? order.ops_tags : []} canResend={hasCapability(staff.role, "fulfillment.operate")} />
        ) : null}

        {/* Notifications */}
        <section className="od-card">
          <h2 className="od-card__title">Customer emails ({notifications.length})</h2>
          {notifications.length ? notifications.map((n, i) => (
            <div key={i} className="od-line"><span>{EVENT_LABEL(n.event)} · {n.channel}</span><span className="om-pay" data-tone={n.status === "sent" ? "paid" : n.status === "failed" ? "failed" : "pending"}>{n.status}</span><span className="admin__muted">{dt(n.created_at)}</span></div>
          )) : <p className="admin__muted">None sent yet.</p>}
        </section>
      </div>

      {/* Audit timeline */}
      <section className="od-section">
        <h2 className="od-card__title">Timeline ({timeline.length})</h2>
        <ol className="od-timeline">
          {timeline.map((e) => (
            <li key={e.id} className="od-tl">
              <span className="od-tl__time">{dt(e.created_at)}</span>
              <span className="od-tl__event">{EVENT_LABEL(e.event)}{e.previous_state && e.new_state ? <span className="admin__muted"> · {e.previous_state}→{e.new_state}</span> : e.new_state ? <span className="admin__muted"> · {e.new_state}</span> : null}</span>
              <span className="od-tl__actor admin__muted">{e.actor_type}{e.notes ? ` · ${e.notes}` : ""}</span>
            </li>
          ))}
          {timeline.length === 0 ? <li className="admin__muted">No events yet.</li> : null}
        </ol>
      </section>
    </main>
  );
}
