import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getMyOrders } from "@/services/accountService";

/** Account dashboard — the customer's home. Middleware gates /account (auth). */
export const metadata: Metadata = { title: "Your Account", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmt = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  const recent = await getMyOrders(user.id, 3);

  return (
    <main className="acc">
      <header className="acc__head">
        <p className="acc__eyebrow">Your Account</p>
        <h1 className="acc__title">Welcome back.</h1>
        <p className="acc__sub">{user.email}</p>
      </header>

      <nav className="acc__nav" aria-label="Account">
        <Link href="/account/orders" className="acc__card"><span className="acc__card-title">Orders</span><span className="acc__card-sub">Track & review past orders</span></Link>
        <Link href="/account/addresses" className="acc__card"><span className="acc__card-title">Addresses</span><span className="acc__card-sub">Manage delivery details</span></Link>
        <Link href="/shop" className="acc__card"><span className="acc__card-title">The Collection</span><span className="acc__card-sub">Discover more</span></Link>
      </nav>

      <section className="acc__section">
        <div className="acc__section-head">
          <h2 className="acc__section-title">Recent orders</h2>
          {recent.length ? <Link href="/account/orders" className="text-link">View all</Link> : null}
        </div>
        {recent.length ? (
          <ul className="acc__orders">
            {recent.map((o) => (
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
      </section>
    </main>
  );
}
