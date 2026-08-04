import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { EMAIL_TEMPLATE_DEFS } from "@/services/emailTemplateService";
import { listEmailDeliveries } from "@/services/emailDeliveryService";

/**
 * Customer-email Delivery Log (Phase 2 · point 12) — a small READ-ONLY view over the canonical
 * `notification_dispatches` table, filtered to one template/event on the email channel. It is NOT a
 * second delivery store and NOT a retry engine: retry is owned by the fulfillment job queue (see the
 * note in the header). Rows deep-link only to STORED domain refs (order / return); there is no stored
 * dispatch→fulfillment-job reference, so no "view job" link is invented.
 */
export const metadata: Metadata = { title: "Email delivery log", robots: { index: false } };
export const dynamic = "force-dynamic";

const rel = (iso: string): string => {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

export default async function EmailDeliveriesPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "content.edit")) redirect("/admin/emails");

  const { event } = await searchParams;
  const def = EMAIL_TEMPLATE_DEFS.find((d) => d.key === event);
  if (!def) redirect("/admin/emails");

  const rows = await listEmailDeliveries(def.key);
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/emails" className="admin__back">← Email Templates</Link></p>
        <h1 className="admin__title">Delivery Log · {def.label}</h1>
        <p className="admin__count">{def.key} · email · {rows.length} recent{failed ? ` · ${failed} failed` : ""}</p>
      </header>

      <p className="cfg-hint">
        Canonical delivery records from the notification system (read-only). <strong>Retry is not performed here</strong> —
        a failed customer email is retried automatically by the fulfillment job queue; this page shows the recorded outcome and error.
      </p>

      {rows.length === 0 ? (
        <p className="admin__empty">No delivery records for this email yet.</p>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>When</th><th>Status</th><th>Recipient</th><th>Detail</th><th>Reference</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="admin__muted" title={r.createdAt}>{rel(r.createdAt)}</td>
                  <td><span className={`adm-badge${r.status === "failed" ? " adm-badge--err" : r.status === "skipped" ? "" : " adm-badge--ok"}`}>{r.status}</span></td>
                  <td className="admin__muted">{r.recipient}</td>
                  <td className="admin__muted">{r.status === "failed" ? (r.error || "—") : r.providerMessageId || "—"}</td>
                  <td>
                    {r.orderNumber ? <Link href={`/admin/orders/${r.orderNumber}`} className="ff-link">Order {r.orderNumber}</Link> : null}
                    {r.entityRef ? <> {r.orderNumber ? "· " : ""}<Link href={`/admin/returns/${r.entityRef}`} className="ff-link">Return</Link></> : null}
                    {!r.orderNumber && !r.entityRef ? <span className="admin__muted">—</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
