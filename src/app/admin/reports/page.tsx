import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getReports } from "@/services/reportsService";

/**
 * Reports — `/admin/reports`. Business & filing reports (GST by state, top
 * products, coupon usage, repeat rate, orders-by-state) complementing the
 * operational Analytics. analytics.view (manager+).
 */
export const metadata: Metadata = { title: "Reports", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const WINDOWS = [{ k: "30", l: "30 days" }, { k: "90", l: "90 days" }, { k: "365", l: "1 year" }, { k: "all", l: "All time" }];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) {
    return <main className="admin"><header className="admin__head"><p className="admin__eyebrow">Insights · {staff.role}</p><h1 className="admin__title">Reports</h1></header><p className="admin__empty">Reports need the analytics.view capability (manager+).</p></main>;
  }

  const sp = await searchParams;
  const win = ["30", "90", "365", "all"].includes(sp.window ?? "") ? (sp.window as string) : "30";
  const r = await getReports(win === "all" ? null : Number(win));
  const canExport = hasCapability(staff.role, "data.export");

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights · {staff.role}</p>
        <h1 className="admin__title">Reports</h1>
      </header>

      <nav className="ff-queues" aria-label="Window">
        {WINDOWS.map((w) => <Link key={w.k} href={`/admin/reports?window=${w.k}`} className="ff-queue" data-active={win === w.k ? "1" : "0"}>{w.l}</Link>)}
      </nav>

      {/* GST report */}
      <section className="ash-metrics">
        <div className="ash-activity__head">
          <h2 className="ash-jump__title">GST report</h2>
          {canExport ? <a className="text-link" href={`/api/admin/reports/gst?window=${win}`}>Export CSV</a> : null}
        </div>
        <div className="ash-metrics__row" style={{ marginBottom: 12 }}>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.taxable)}</span><span className="ash-metric__l">Taxable value</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.cgst)}</span><span className="ash-metric__l">CGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.sgst)}</span><span className="ash-metric__l">SGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.igst)}</span><span className="ash-metric__l">IGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.total)}</span><span className="ash-metric__l">Gross</span></div>
        </div>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>State</th><th>Orders</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
            <tbody>
              {r.gst.byState.map((s) => (
                <tr key={s.state}><td>{s.state}</td><td className="admin__mono">{s.orders}</td><td className="admin__mono">{inr(s.taxable)}</td><td className="admin__mono">{inr(s.cgst)}</td><td className="admin__mono">{inr(s.sgst)}</td><td className="admin__mono">{inr(s.igst)}</td><td className="admin__mono">{inr(s.total)}</td></tr>
              ))}
              {r.gst.byState.length === 0 ? <tr><td colSpan={7} className="admin__empty">No paid orders in window.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="od-grid">
        {/* Top products */}
        <section className="od-card">
          <h2 className="od-card__title">Top products</h2>
          {r.topProducts.length ? r.topProducts.map((p) => (
            <div key={p.name} className="od-line"><span>{p.name}</span><span className="admin__muted">{p.units}u</span><span className="admin__mono">{inr(p.revenue)}</span></div>
          )) : <p className="admin__muted">No sales in window.</p>}
        </section>

        {/* Coupon usage */}
        <section className="od-card">
          <h2 className="od-card__title">Coupon usage</h2>
          {r.coupons.length ? r.coupons.map((c) => (
            <div key={c.code} className="od-line"><span className="admin__mono">{c.code}</span><span className="admin__muted">{c.redemptions}×</span><span className="admin__mono">−{inr(c.discountGiven)}</span></div>
          )) : <p className="admin__muted">No coupons used.</p>}
        </section>
      </div>

      <div className="od-grid">
        {/* Repeat rate */}
        <section className="od-card">
          <h2 className="od-card__title">Customers</h2>
          <div className="ash-metrics__row">
            <div className="ash-metric"><span className="ash-metric__v">{r.customers.total}</span><span className="ash-metric__l">Buyers</span></div>
            <div className="ash-metric"><span className="ash-metric__v">{r.customers.returning}</span><span className="ash-metric__l">Returning</span></div>
            <div className="ash-metric"><span className="ash-metric__v">{r.customers.repeatRate}%</span><span className="ash-metric__l">Repeat rate</span></div>
          </div>
        </section>

        {/* Orders by state */}
        <section className="od-card">
          <h2 className="od-card__title">Orders by state</h2>
          {r.ordersByState.length ? r.ordersByState.slice(0, 12).map((s) => (
            <div key={s.state} className="od-line"><span>{s.state}</span><span className="admin__muted">{s.orders} orders</span><span className="admin__mono">{inr(s.revenue)}</span></div>
          )) : <p className="admin__muted">No orders in window.</p>}
        </section>
      </div>
    </main>
  );
}
