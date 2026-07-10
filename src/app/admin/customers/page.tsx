import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listCustomers } from "@/services/customerAdminService";

/**
 * Customers (CRM) — `/admin/customers`. Customer 360 list: LTV, order count,
 * segment, consent. PII → analytics.view (manager+).
 */
export const metadata: Metadata = { title: "Customers", robots: { index: false } };
export const dynamic = "force-dynamic";

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const SEG_TONE: Record<string, string> = { vip: "gold", repeat: "paid", new: "pending" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
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
  const customers = await listCustomers({ search: sp.search });

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">CRM · {staff.role}</p>
        <h1 className="admin__title">Customers</h1>
        <p className="admin__count">{customers.length} {customers.length === 1 ? "customer" : "customers"}</p>
      </header>

      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search email, name, phone…" />
        <button type="submit" className="ff-btn ff-btn--primary">Search</button>
        {sp.search ? <a href="/admin/customers" className="ff-btn">Clear</a> : null}
      </form>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th>Customer</th><th>Segment</th><th>Orders</th><th>Lifetime value</th><th>Consent</th><th>Tags</th></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><a href={`/admin/customers/${c.id}`} className="od-link">{c.name}</a><div className="admin__muted">{c.email}</div></td>
                <td><span className="om-pay" data-tone={SEG_TONE[c.segment]}>{c.segment}</span></td>
                <td className="admin__mono">{c.orders}</td>
                <td className="admin__mono">{money(c.ltv)}</td>
                <td>{c.marketingConsent ? <span className="adm-badge" data-b="cod">opted in</span> : <span className="admin__muted">—</span>}</td>
                <td><div className="adm-badges">{c.tags.map((t) => <span key={t} className="adm-badge">{t}</span>)}</div></td>
              </tr>
            ))}
            {customers.length === 0 ? <tr><td colSpan={6} className="admin__empty">No customers match.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
