import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getMyOrders } from "@/services/accountService";

export const metadata: Metadata = { title: "Your Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmt = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default async function AccountOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/orders");
  const orders = await getMyOrders(user.id);

  return (
    <main className="acc">
      <header className="acc__head">
        <p className="acc__eyebrow"><Link href="/account" className="text-link">← Account</Link></p>
        <h1 className="acc__title">Your orders</h1>
      </header>

      {orders.length ? (
        <ul className="acc__orders">
          {orders.map((o) => (
            <li key={o.orderNumber}>
              <Link href={`/account/orders/${o.orderNumber}`} className="acc__order">
                <span className="acc__order-no">{o.orderNumber}</span>
                <span className="acc__order-meta">{fmt(o.placedAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>
                <span className="acc__order-status" data-s={o.status}>{o.status}</span>
                <span className="acc__order-total">{money(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="acc__empty">No orders yet. <Link href="/shop" className="text-link">Begin with the collection →</Link></p>
      )}
    </main>
  );
}
