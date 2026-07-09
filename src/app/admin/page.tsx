import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getDashboardStats } from "@/services/orderAdminService";

/**
 * Admin Dashboard — `/admin`. The landing module (SLP principle 21): headline
 * operational counts + jump-off links to the live modules. Renders inside the
 * admin shell (nav supplied by the layout).
 */
export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const staff = await requireStaff("editor");
  const stats = await getDashboardStats();

  const tiles: { label: string; value: number; href?: string; tone?: string }[] = [
    { label: "Awaiting fulfillment", value: stats.awaitingFulfillment, href: "/admin/fulfillment" },
    { label: "Ready for dispatch", value: stats.readyForDispatch, href: "/admin/fulfillment", tone: "gold" },
    { label: "On hold", value: stats.onHold, href: "/admin/fulfillment", tone: stats.onHold ? "warn" : undefined },
    { label: "In transit", value: stats.shippedActive, href: "/admin/orders" },
    { label: "Refunds pending", value: stats.refundsPending, href: "/admin/orders", tone: stats.refundsPending ? "warn" : undefined },
    { label: "Total orders", value: stats.totalOrders, href: "/admin/orders" },
  ];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Dashboard</h1>
        <p className="admin__count">At-a-glance operational state</p>
      </header>

      <div className="ash-tiles">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="ash-tile__value" data-tone={t.tone ?? "plain"}>{t.value}</span>
              <span className="ash-tile__label">{t.label}</span>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="ash-tile ash-tile--link">{inner}</Link>
          ) : (
            <div key={t.label} className="ash-tile">{inner}</div>
          );
        })}
      </div>

      <section className="ash-jump">
        <h2 className="ash-jump__title">Modules</h2>
        <div className="ash-jump__row">
          <Link href="/admin/orders" className="ash-jump__card">
            <span className="ash-jump__name">Orders</span>
            <span className="ash-jump__desc">Cancellations, refunds, payment state</span>
          </Link>
          <Link href="/admin/fulfillment" className="ash-jump__card">
            <span className="ash-jump__name">Fulfillment</span>
            <span className="ash-jump__desc">Pick → pack → QC → dispatch, triage</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
