import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getCustomer360 } from "@/services/customerAdminService";
import { getAccountAudit } from "@/services/accountAuditService";
import { CustomerMeta } from "@/components/admin/CustomerMeta";

export const metadata: Metadata = { title: "Customer", robots: { index: false } };
export const dynamic = "force-dynamic";

const AUDIT_LABEL: Record<string, string> = { login: "Signed in", logout: "Signed out", password_change: "Changed password", email_change: "Changed email", profile_update: "Updated profile", address_change: "Changed an address", wishlist_change: "Changed wishlist", newsletter_change: "Newsletter preference" };
const auditAgo = (v: string) => { const d = (Date.now() - new Date(v).getTime()) / 86400000; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)}d ago`; };

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const fmt = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const SEG_TONE: Record<string, string> = { vip: "gold", repeat: "paid", new: "pending" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) redirect("/admin");
  const { id } = await params;

  const c = await getCustomer360(id);
  if (!c) notFound();
  const audit = await getAccountAudit(id, 12);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/customers" className="od-back">← Customers</Link></p>
        <h1 className="admin__title">{c.name}</h1>
        <p className="admin__count">
          <span className="om-pay" data-tone={SEG_TONE[c.segment]}>{c.segment}</span>
          <span className="admin__muted"> · {c.email}{c.phone ? ` · ${c.phone}` : ""}{c.marketingConsent ? " · opted in" : ""}</span>
        </p>
      </header>

      {/* KPIs */}
      <div className="ash-metrics__row" style={{ marginBottom: 14 }}>
        <div className="ash-metric"><span className="ash-metric__v">{money(c.ltv)}</span><span className="ash-metric__l">Lifetime value</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{c.orderCount}</span><span className="ash-metric__l">Paid orders</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{money(c.aov)}</span><span className="ash-metric__l">Avg order</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{c.loyaltyPoints}</span><span className="ash-metric__l">Loyalty pts · {c.loyaltyTier}</span></div>
      </div>

      {/* CRM insight (R13) */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Profile insight</h2>
          <div className="od-line"><span className="admin__muted">Favourite fragrance</span><span>{c.favouriteFragrance ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Favourite collection</span><span>{c.favouriteCollection ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Preferred jar size</span><span>{c.preferredJarSize ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Price range</span><span>{c.favouritePriceRange ?? "—"}</span></div>
          <div className="od-line"><span className="admin__muted">Acquisition channel</span><span>{c.acquisition ? c.acquisition.channel : "Direct / unknown"}</span></div>
          {c.acquisition ? <div className="od-line"><span className="admin__muted">Source detail</span><span>{c.acquisition.source}{c.acquisition.campaign !== "—" ? ` · ${c.acquisition.campaign}` : ""}</span></div> : null}
          <div className="od-line"><span className="admin__muted">Last viewed</span><span className="admin__muted">needs storefront view-tracking (planned)</span></div>
        </section>

        {/* Wishlist */}
        <section className="od-card">
          <h2 className="od-card__title">Wishlist ({c.wishlist.length})</h2>
          {c.wishlist.length ? c.wishlist.slice(0, 12).map((w, i) => (
            <div key={i} className="od-line"><span>{w.product}</span>{w.fragrance ? <span className="admin__muted">{w.fragrance}</span> : null}<span className="admin__muted">{fmt(w.addedAt)}</span></div>
          )) : <p className="admin__muted">Nothing saved yet.</p>}
        </section>
      </div>

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

      {/* Account activity (audit trail — CS/admin only) */}
      <section className="od-card" style={{ marginTop: 14 }}>
        <h2 className="od-card__title">Account activity</h2>
        {audit.length ? audit.map((a, i) => (
          <div key={i} className="od-line">
            <span>{AUDIT_LABEL[a.event] ?? a.event}</span>
            <span className="admin__muted">{a.metadata?.provider ? String(a.metadata.provider) : a.metadata?.action ? String(a.metadata.action) : ""}</span>
            <span className="admin__muted">{auditAgo(a.createdAt)}</span>
          </div>
        )) : <p className="admin__muted">No recorded account activity.</p>}
      </section>
    </main>
  );
}
