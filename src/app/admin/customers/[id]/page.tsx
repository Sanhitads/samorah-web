import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getCustomer360, getCustomerTimeline, getCustomerEmailHistory } from "@/services/customerAdminService";
import { getAccountAudit } from "@/services/accountAuditService";
import { CustomerMeta } from "@/components/admin/CustomerMeta";
import { CustomerJourney } from "@/components/admin/CustomerJourney";
import { Timeline } from "@/components/admin/Timeline";

export const metadata: Metadata = { title: "Customer", robots: { index: false } };
export const dynamic = "force-dynamic";

const AUDIT_LABEL: Record<string, string> = { login: "Signed in", logout: "Signed out", password_change: "Changed password", email_change: "Changed email", profile_update: "Updated profile", address_change: "Changed an address", wishlist_change: "Changed wishlist", newsletter_change: "Newsletter preference" };
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const auditAgo = (v: string) => { const d = (Date.now() - new Date(v).getTime()) / 86400000; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)}d ago`; };

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmt = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const SEG_TONE: Record<string, string> = { vip: "gold", repeat: "paid", new: "pending" };
const CONSENT_LABEL: Record<string, string> = { in: "Opted in", out: "Opted out", unknown: "Not tracked" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) redirect("/admin");
  const { id } = await params;

  const c = await getCustomer360(id);
  if (!c) notFound();
  const [audit, timeline, emails] = await Promise.all([getAccountAudit(id, 12), getCustomerTimeline(id), getCustomerEmailHistory(id)]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/customers" className="od-back">← Customers</Link></p>
        <h1 className="admin__title">{c.name}</h1>
        <p className="admin__count">
          <span className="om-pay" data-tone={SEG_TONE[c.segment]}>{c.segment}</span>
          <span className="oh-badge" data-h={c.health.tone} title={c.health.reason} style={{ marginLeft: 8 }}>{c.health.dot} {c.health.label}</span>
          {c.flags.map((f) => <span key={f.key} className="om-pay" data-tone={f.tone} style={{ marginLeft: 8 }}>{f.label}</span>)}
          {c.isOneYear ? <span className="adm-badge" data-b="gst" style={{ marginLeft: 8 }} title="Customer for over a year">🎉 1+ year</span> : null}
          <span className="admin__muted"> · Customer since {fmt(c.createdAt)}{c.birthday ? ` · 🎂 ${new Date(c.birthday).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}</span>
        </p>
      </header>

      {/* Communication quick actions (review section 10) */}
      <div className="ship-quick">
        {c.phone ? <a className="ff-btn" href={`tel:${c.phone}`}>☎ Call</a> : null}
        <a className="ff-btn" href={`mailto:${c.email}`}>📧 Email</a>
        {c.phoneDigits ? <a className="ff-btn" href={`https://wa.me/${c.phoneDigits}`} target="_blank" rel="noreferrer">💬 WhatsApp</a> : null}
        <span className="admin__muted" style={{ alignSelf: "center" }}>{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
      </div>

      {/* Value KPIs (review section 14) */}
      <div className="ash-metrics__row" style={{ marginBottom: 14 }}>
        <div className="ash-metric"><span className="ash-metric__v">{money(c.ltv)}</span><span className="ash-metric__l">Lifetime value</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{c.orderCount}</span><span className="ash-metric__l">Paid orders</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{money(c.aov)}</span><span className="ash-metric__l">Avg order</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{money(c.highestOrder)}</span><span className="ash-metric__l">Highest order</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{c.lastOrderAt ? fmt(c.lastOrderAt) : "—"}</span><span className="ash-metric__l">Last order</span></div>
      </div>

      <div className="od-grid">
        {/* Financial summary (review priority 4) */}
        <section className="od-card od-card--finance">
          <h2 className="od-card__title">Financial summary</h2>
          <dl className="od-dl od-dl--fin">
            <div><dt>Lifetime value</dt><dd>{money(c.financial.ltv)}</dd></div>
            <div><dt>Refunded</dt><dd>{money(c.financial.refunded)}</dd></div>
            <div><dt>Store credit</dt><dd className="admin__muted">{money(c.financial.storeCredit)}</dd></div>
            <div><dt>Average order</dt><dd>{money(c.financial.aov)}</dd></div>
            <div><dt>Highest order</dt><dd>{money(c.financial.highest)}</dd></div>
            <div className="od-dl__net"><dt>Net revenue</dt><dd>{money(c.financial.netRevenue)}</dd></div>
          </dl>
          <p className="om-field__hint">Net revenue = lifetime value − refunded. Store credit ledger is post-launch (shows ₹0).</p>
        </section>

        {/* Returns & risk summary (review sections 9, 15) */}
        <section className="od-card">
          <h2 className="od-card__title">Returns &amp; risk</h2>
          <dl className="od-dl od-dl--fin">
            <div><dt>Total returns</dt><dd>{c.totalReturns}</dd></div>
            <div><dt>Refunded</dt><dd>{money(c.refundTotal)}</dd></div>
            <div><dt>Replacements</dt><dd>{c.replacementCount}</dd></div>
            <div><dt>Failed payments</dt><dd data-tone={c.failedPayments ? "warn" : undefined}>{c.failedPayments}</dd></div>
            <div><dt>RTO</dt><dd data-tone={c.rtoCount ? "warn" : undefined}>{c.rtoCount}</dd></div>
            <div><dt>Fraud review</dt><dd>{c.fraudFlag ? <span className="om-pay" data-tone="over">flagged</span> : <span className="admin__muted">none</span>}</dd></div>
          </dl>
        </section>

        {/* Marketing consent — display only (review section 11) */}
        <section className="od-card">
          <h2 className="od-card__title">Marketing consent</h2>
          {c.consent.map((ch) => (
            <div key={ch.channel} className="od-line"><span>{ch.channel}</span><span className={ch.state === "in" ? "" : "admin__muted"}>{ch.state === "in" ? "✓ " : ""}{CONSENT_LABEL[ch.state]}</span></div>
          ))}
          <p className="om-field__hint">Display only — preference management is post-launch. Only email consent is stored today.</p>
        </section>
      </div>

      {/* CRM insight + wishlist (existing) */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Profile insight</h2>
          <div className="od-line"><span className="admin__muted">Favourite fragrance</span><span>{c.favouriteFragrance ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Favourite collection</span><span>{c.favouriteCollection ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Preferred jar size</span><span>{c.preferredJarSize ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Price range</span><span>{c.favouritePriceRange ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Acquisition channel</span><span>{c.acquisition ? c.acquisition.channel : "Direct / unknown"}</span></div>
          {c.acquisition ? <div className="od-line"><span className="admin__muted">Source detail</span><span>{c.acquisition.source}{c.acquisition.campaign !== "—" ? ` · ${c.acquisition.campaign}` : ""}</span></div> : null}
        </section>
        <section className="od-card">
          <h2 className="od-card__title">Wishlist ({c.wishlist.length})</h2>
          {c.wishlist.length ? c.wishlist.slice(0, 12).map((w, i) => (
            <div key={i} className="od-line"><span>{w.product}</span>{w.fragrance ? <span className="admin__muted">{w.fragrance}</span> : null}<span className="admin__muted">{fmt(w.addedAt)}</span></div>
          )) : <p className="admin__muted">Nothing saved yet.</p>}
        </section>
      </div>

      {/* Customer journey (review priority 4) */}
      <details className="od-group" open>
        <summary className="od-group__sum">Customer journey</summary>
        <section className="od-card"><CustomerJourney milestones={c.journey} /></section>
      </details>

      <div className="od-grid">
        {/* Orders */}
        <section className="od-card">
          <h2 className="od-card__title">Orders ({c.orders.length})</h2>
          {c.orders.length ? c.orders.slice(0, 12).map((o) => (
            <div key={o.orderNumber} className="od-line">
              <Link href={`/admin/orders/${o.orderNumber}`} className="admin__mono od-link">{o.orderNumber}</Link>
              <span className="ff-status" data-s={o.status}>{o.status}</span>
              <span className="admin__muted">{fmt(o.placedAt)}</span>
              <span className="admin__mono">{money(o.total)}</span>
            </div>
          )) : <p className="admin__muted">No orders.</p>}
        </section>

        {/* CRM notes + tags */}
        <CustomerMeta id={c.id} notes={c.notes} tags={c.tags} />
      </div>

      <div className="od-grid">
        {/* Addresses */}
        <section className="od-card">
          <h2 className="od-card__title">Addresses ({c.addresses.length})</h2>
          {c.addresses.length ? c.addresses.map((a, i) => (
            <p key={i} className="acc__addr" style={{ marginBottom: 10 }}>{a.isDefault ? "★ " : ""}{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}</p>
          )) : <p className="admin__muted">No saved addresses.</p>}
        </section>

        {/* Returns */}
        <section className="od-card">
          <h2 className="od-card__title">Returns ({c.returns.length})</h2>
          {c.returns.length ? c.returns.map((r) => (
            <div key={r.rma} className="od-line"><span className="admin__mono">{r.rma}</span><span className="ff-status" data-s={r.status}>{r.status}</span><span className="admin__muted">{r.reason ?? ""}</span></div>
          )) : <p className="admin__muted">No returns.</p>}
        </section>
      </div>

      {/* Email history (review section 8) */}
      <details className="od-group" open={emails.length > 0}>
        <summary className="od-group__sum">Email history <span className="count-badge" data-empty={emails.length === 0}>{emails.length}</span></summary>
        <section className="od-card">
          {emails.length ? emails.map((n, i) => (
            <div key={i} className="od-line"><span>{EVENT_LABEL(n.event)} · {n.channel}</span><span className="om-pay" data-tone={n.status === "sent" ? "paid" : n.status === "failed" ? "failed" : "pending"}>{n.status}</span><span className="admin__muted">{dt(n.created_at)}</span></div>
          )) : <p className="admin__muted">No emails sent yet.</p>}
        </section>
      </details>

      {/* Customer timeline — commerce activity across all orders (review section 5) */}
      <details className="od-group">
        <summary className="od-group__sum">Customer timeline <span className="count-badge" data-empty={timeline.length === 0}>{timeline.length}</span></summary>
        <Timeline events={timeline} bare />
      </details>

      {/* Account activity (login / profile audit) */}
      <details className="od-group">
        <summary className="od-group__sum">Account activity <span className="count-badge" data-empty={audit.length === 0}>{audit.length}</span></summary>
        <section className="od-card">
          {audit.length ? audit.map((a, i) => (
            <div key={i} className="od-line">
              <span>{AUDIT_LABEL[a.event] ?? a.event}</span>
              <span className="admin__muted">{a.metadata?.provider ? String(a.metadata.provider) : a.metadata?.action ? String(a.metadata.action) : ""}</span>
              <span className="admin__muted">{auditAgo(a.createdAt)}</span>
            </div>
          )) : <p className="admin__muted">No recorded account activity.</p>}
        </section>
      </details>
    </main>
  );
}
