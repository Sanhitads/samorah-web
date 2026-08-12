import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getEnquiriesQueue, getEnquiryStatusCounts } from "@/services/enquiryService";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_STATUSES, isEnquiryStatus } from "@/lib/enquiries/state";

/** Customer Enquiries — `/admin/enquiries` (Operations). Messages from the /contact form. editor+ read. */
export const metadata: Metadata = { title: "Customer Enquiries", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;
  const status = sp.status && isEnquiryStatus(sp.status) ? sp.status : undefined;
  const [rows, counts] = await Promise.all([getEnquiriesQueue({ status, limit: 300 }), getEnquiryStatusCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Customer Enquiries</h1>
        <div className="admin__headrow">
          <p className="admin__count">{total} enquiries{counts.new ? ` · ${counts.new} new` : ""}</p>
          <a className="ff-btn" href="/api/admin/enquiries/export">Export CSV</a>
        </div>
      </header>

      <div className="enq-filters">
        <Link href="/admin/enquiries" className="ff-btn" data-active={!status ? "1" : "0"}>All</Link>
        {ENQUIRY_STATUSES.map((s) => (
          <Link key={s} href={`/admin/enquiries?status=${s}`} className="ff-btn" data-active={status === s ? "1" : "0"}>
            {ENQUIRY_STATUS_LABEL[s]}{counts[s] ? ` (${counts[s]})` : ""}
          </Link>
        ))}
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th>Received</th><th>Name</th><th>Subject</th><th>Email</th><th>Order</th><th>Status</th><th>Assigned</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="admin__mono">{fmt(r.createdAt)}</td>
                <td><Link href={`/admin/enquiries/${r.id}`} className="od-link">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</Link></td>
                <td>{r.subject}</td>
                <td className="admin__mono">{r.email}</td>
                <td className="admin__mono">{r.orderNumber ?? "—"}</td>
                <td><span className="ff-status" data-s={r.status}>{ENQUIRY_STATUS_LABEL[r.status]}</span></td>
                <td>{r.assigneeName ?? <span className="admin__muted">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="admin__empty">{status ? `No enquiries marked “${ENQUIRY_STATUS_LABEL[status]}” yet.` : "No customer enquiries yet."}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
