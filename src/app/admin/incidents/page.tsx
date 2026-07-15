import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getIncidents } from "@/services/incidentService";
import { RunCorrelation } from "@/components/admin/IncidentControls";

/** Incident list — `/admin/incidents`. The correlation layer above notifications. */
export const metadata: Metadata = { title: "Incidents", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEV_ICON: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪" };
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.floor(m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { view } = await searchParams;
  const all = view === "all";
  const incidents = await getIncidents({ status: all ? "all" : "active" });

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · {staff.role}</p>
          <h1 className="admin__title">Incidents</h1>
          <p className="admin__count">{incidents.length} {all ? "total" : "open"} · related notifications grouped by root cause</p>
        </div>
        <RunCorrelation />
      </header>

      <nav className="ff-queues" aria-label="View">
        <Link href="/admin/incidents" className="ff-queue" data-active={!all ? "1" : "0"}>Open</Link>
        <Link href="/admin/incidents?view=all" className="ff-queue" data-active={all ? "1" : "0"}>All</Link>
      </nav>

      {incidents.length ? (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Incident</th><th>Category</th><th>Severity</th><th>Status</th><th>Orders</th><th>Started</th><th>Last activity</th><th>Assigned</th><th></th></tr></thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/admin/incidents/${i.number}`} className="admin__mono od-link">{i.number}</Link><div className="admin__muted" style={{ fontSize: 12 }}>{i.title}</div></td>
                  <td>{i.categoryLabel}</td>
                  <td><span className="inc-sev" data-s={i.severity}>{SEV_ICON[i.severity]} {i.severity}</span></td>
                  <td><span className="inc-status" data-s={i.status}>{i.status}</span></td>
                  <td className="admin__mono">{i.affectedOrders}</td>
                  <td className="admin__muted">{ago(i.startedAt)}</td>
                  <td className="admin__muted">{ago(i.lastActivityAt)}</td>
                  <td className="admin__muted">{i.assigneeName ?? "—"}</td>
                  <td><Link href={`/admin/incidents/${i.number}`} className="text-link">Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-alerts">
          <span className="no-alerts__check">✓</span>
          <p className="no-alerts__title">No {all ? "" : "open "}incidents</p>
          <p className="no-alerts__sub">Incidents open automatically when correlated failures cross a rule threshold. Notifications continue to work as normal.</p>
        </div>
      )}
    </main>
  );
}
