import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listCustomers, getCustomerCounts, type CustomerFilter } from "@/services/customerAdminService";
import { initials, avatarHue, spendTier, repeatBadge, customerNameBadges } from "@/lib/customer/display";

/**
 * Customers (CRM) — `/admin/customers`. Operational customer board, consistent with Orders /
 * Fulfillment / Returns / Shipments: an analytics strip, global search + filters, a derived health
 * verdict, LTV / AOV / last-order / customer-since columns, and a row that opens the Customer 360
 * profile. PII → analytics.view (manager+). Additive over the existing users + orders data.
 */
export const metadata: Metadata = { title: "Customers", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmtD = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const monthYr = (v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const SEG_TONE: Record<string, string> = { vip: "gold", repeat: "paid", new: "pending" };
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const waDigits = (p: string | null) => (p ? p.replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10})$/, "91$1") : "");
const relDay = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`; };
const stars = (t: number) => "★".repeat(t) + "☆".repeat(5 - t);

const SEGMENTS = [{ v: "vip", l: "VIP" }, { v: "repeat", l: "Repeat" }, { v: "new", l: "New" }];
const HEALTHS = [{ v: "healthy", l: "Healthy" }, { v: "at_risk", l: "At Risk" }, { v: "inactive", l: "Inactive" }, { v: "lost", l: "Lost" }];
const LTV_RANGES = [{ v: "0-1000", l: "₹0–1,000" }, { v: "1000-5000", l: "₹1,000–5,000" }, { v: "5000+", l: "₹5,000+" }];
const ORDER_RANGES = [{ v: "0", l: "0 orders" }, { v: "1-5", l: "1–5" }, { v: "5+", l: "5+" }, { v: "10+", l: "10+" }];
const LAST_ORDER = [{ v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }, { v: "90d", l: "Last 90 days" }, { v: "1y", l: "Last year" }];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<CustomerFilter> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">CRM · {staff.role}</p><h1 className="admin__title">Customers</h1></header>
        <p className="admin__empty">Customer data needs the analytics.view capability (manager+).</p>
      </main>
    );
  }

  const sp = await searchParams;
  const [customers, counts] = await Promise.all([listCustomers(sp), getCustomerCounts()]);
  const anyFilter = Object.values(sp).some(Boolean);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">CRM · {staff.role}</p>
        <h1 className="admin__title">Customers</h1>
        <p className="admin__count">{customers.length} {customers.length === 1 ? "customer" : "customers"}{anyFilter ? " · filtered" : ""}</p>
      </header>

      {/* Analytics strip (review 1.1) */}
      <div className="oms-strip">
        <a href="/admin/customers" className="oms-stat oms-stat--link"><span className="oms-stat__n">{counts.total}</span><span className="oms-stat__l">Total</span></a>
        <a href="/admin/customers?since=30d" className="oms-stat oms-stat--link" data-active={sp.since === "30d" ? "1" : undefined}><span className="oms-stat__n">{counts.new30d}</span><span className="oms-stat__l">New · 30d</span></a>
        <a href="/admin/customers?segment=repeat" className="oms-stat oms-stat--link" data-active={sp.segment === "repeat" ? "1" : undefined}><span className="oms-stat__n">{counts.returning}</span><span className="oms-stat__l">Returning</span></a>
        <a href="/admin/customers?segment=vip" className="oms-stat oms-stat--link" data-active={sp.segment === "vip" ? "1" : undefined}><span className="oms-stat__n">{counts.vip}</span><span className="oms-stat__l">VIP</span></a>
        <a href="/admin/customers?newsletter=1" className="oms-stat oms-stat--link" data-active={sp.newsletter === "1" ? "1" : undefined}><span className="oms-stat__n">{counts.newsletter}</span><span className="oms-stat__l">Newsletter</span></a>
        <a href="/admin/customers?wholesale=1" className="oms-stat oms-stat--link" data-active={sp.wholesale === "1" ? "1" : undefined}><span className="oms-stat__n">{counts.wholesale}</span><span className="oms-stat__l">Wholesale</span></a>
        <div className="oms-stat"><span className="oms-stat__n">{money(counts.avgLtv)}</span><span className="oms-stat__l">Avg LTV</span></div>
      </div>

      {/* Search + filters (review 1.2 / 1.3) */}
      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search name, email, phone, customer id, order #, city…" />
        <select name="segment" defaultValue={sp.segment ?? ""} aria-label="Segment"><option value="">Any segment</option>{SEGMENTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        <select name="health" defaultValue={sp.health ?? ""} aria-label="Health"><option value="">Any health</option>{HEALTHS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}</select>
        <select name="newsletter" defaultValue={sp.newsletter ?? ""} aria-label="Newsletter"><option value="">Newsletter · any</option><option value="1">Subscribed</option><option value="0">Not subscribed</option></select>
        <select name="wholesale" defaultValue={sp.wholesale ?? ""} aria-label="Wholesale"><option value="">Wholesale · any</option><option value="1">Wholesale</option></select>
        <select name="ltv" defaultValue={sp.ltv ?? ""} aria-label="Lifetime value"><option value="">Any LTV</option>{LTV_RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
        <select name="orders" defaultValue={sp.orders ?? ""} aria-label="Order count"><option value="">Any orders</option>{ORDER_RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
        <select name="lastOrder" defaultValue={sp.lastOrder ?? ""} aria-label="Last order"><option value="">Last order · any</option>{LAST_ORDER.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {anyFilter ? <a href="/admin/customers" className="ff-btn">Clear</a> : null}
      </form>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th>Customer</th><th>Segment</th><th>Health</th><th>Orders</th><th>Value</th><th>Last activity</th><th>Actions</th></tr></thead>
          <tbody>
            {customers.map((c) => {
              const nameBadges = customerNameBadges(c.segment, c.wholesale, c.tags);
              const rep = repeatBadge(c.orders);
              const tier = spendTier(c.ltv);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="cust-cell">
                      <span className="cust-avatar" style={{ background: `hsl(${avatarHue(c.id)} 45% 88%)`, color: `hsl(${avatarHue(c.id)} 45% 30%)` }}>{initials(c.name)}</span>
                      <div>
                        <div className="cust-cell__name">
                          <Link href={`/admin/customers/${c.id}`} className="od-link">{c.name}</Link>
                          {nameBadges.map((b) => <span key={b.label} className="cust-namebadge" data-tone={b.tone} title={b.label}>{b.icon} {b.label}</span>)}
                        </div>
                        <div className="admin__muted">{c.email}</div>
                        <div className="admin__muted">since {monthYr(c.createdAt)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="om-pay" data-tone={SEG_TONE[c.segment]}>{c.segment}</span>
                    {rep ? <div className="adm-badge" data-b="gst" style={{ marginTop: 4 }}>{rep.label}</div> : null}
                  </td>
                  <td><span className="oh-badge" data-h={c.health.tone} title={c.health.reason}>{c.health.dot} {c.health.label}</span></td>
                  <td className="admin__mono">{c.orders}<div className="admin__muted">{c.lastOrderAt ? `Last ${fmtD(c.lastOrderAt)}` : "—"}</div></td>
                  <td className="admin__mono">{money(c.ltv)}{c.aov ? <div className="admin__muted">avg {money(c.aov)}</div> : null}<div className="cust-stars" title={`${tier.label} · ${money(c.ltv)}`}>{stars(tier.tier)}</div></td>
                  <td>{c.lastActivity ? <div className="cust-activity"><span>{EVENT_LABEL(c.lastActivity.event)}</span><span className="admin__muted">{relDay(c.lastActivity.at)}</span></div> : <span className="admin__muted">—</span>}</td>
                  <td>
                    <div className="cust-actions">
                      <Link href={`/admin/customers/${c.id}`} className="ff-btn ff-btn--mini">View</Link>
                      {c.phone ? <a className="ff-btn ff-btn--mini" href={`tel:${c.phone}`} title="Call">☎</a> : null}
                      {c.phone ? <a className="ff-btn ff-btn--mini" href={`https://wa.me/${waDigits(c.phone)}`} target="_blank" rel="noreferrer" title="WhatsApp">💬</a> : null}
                      <a className="ff-btn ff-btn--mini" href={`mailto:${c.email}`} title="Email">📧</a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 ? <tr><td colSpan={7} className="admin__empty">No customers match{anyFilter ? " these filters" : ""}.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
