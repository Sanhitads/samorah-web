import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionUser, getMyOrder } from "@/services/accountService";
import { signOrderToken } from "@/lib/orderToken";

export const metadata: Metadata = { title: "Order", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

export default async function AccountOrderDetail({ params }: { params: Promise<{ orderNumber: string }> }) {
  const user = await getSessionUser();
  const { orderNumber } = await params;
  if (!user) redirect(`/login?next=/account/orders/${orderNumber}`);

  const order = await getMyOrder(user.id, orderNumber);
  if (!order) notFound(); // not found OR not owned by this user
  const items = (order.order_items ?? []) as any[];
  const token = signOrderToken(order.order_number);

  return (
    <main className="acc">
      <header className="acc__head">
        <p className="acc__eyebrow"><Link href="/account/orders" className="text-link">← Orders</Link></p>
        <h1 className="acc__title">{order.order_number}</h1>
        <p className="acc__sub"><span className="acc__order-status" data-s={order.status}>{order.status}</span> · placed {fmt(order.placed_at)}</p>
      </header>

      <div className="acc__detail">
        <section className="acc__panel">
          <h2 className="acc__panel-title">Items</h2>
          <ul className="acc__items">
            {items.map((it) => (
              <li key={it.id} className="acc__item">
                <span>{it.product_name}{it.vessel ? ` · ${it.vessel} ${it.size ?? ""}` : it.variant_name ? ` · ${it.variant_name}` : ""} × {it.quantity}</span>
                <span className="acc__item-price">{money(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="acc__total"><span>Total</span><span>{money(order.total_amount)}</span></div>
        </section>

        <section className="acc__panel">
          <h2 className="acc__panel-title">Delivery</h2>
          <p className="acc__addr">{order.ship_full_name}<br />{order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ""}<br />{order.ship_city}, {order.ship_state} {order.ship_pincode}</p>
          <div className="acc__actions">
            <Link href={`/order/${order.order_number}/track?t=${encodeURIComponent(token)}`} className="btn btn-outline">Track order</Link>
            {order.invoice_number ? <Link href={`/order/${order.order_number}/invoice?t=${encodeURIComponent(token)}`} className="text-link">Download invoice</Link> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
