import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIncidentsFiltered, getSystemHealth, type IncidentFilters } from "@/services/incidentService";
import { RunCorrelation, IncidentFilterBar } from "@/components/admin/IncidentControls";
import { HealthStrip } from "@/components/admin/IncidentHealth";
import { TEAM_LABEL, ROOT_CAUSE_LABEL, type RootCauseSystem } from "@/config/incidents";

/** Incident list — `/admin/incidents`. Filters, search, pagination, export (Phase 2). */
export const metadata: Metadata = { title: "Incidents", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEV_ICON: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪" };
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.floor(m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

async function myName(userId: string | null): Promise<string | undefined> {
  if (!userId) return undefined;
  try { const db = createAdminClient() as any; const { data } = await db.from("users").select("full_name").eq("id", userId).maybeSingle(); return data?.full_name ?? undefined; } catch { return undefined; } // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;

  const filters: IncidentFilters = {
    status: sp.status || "active", severity: sp.severity || undefined, category: sp.category || undefined,
    team: sp.team || undefined, priority: sp.priority || undefined,
    reviewQueue: sp.review === "1", slaBreached: sp.sla === "breached",
    assigned: sp.assigned === "mine" ? (await myName(staff.userId)) : sp.assigned || undefined,
    createdDays: sp.created ? Number(sp.created) : undefined, resolvedToday: sp.resolved === "today",
    q: sp.q || undefined, page: sp.page ? Number(sp.page) : 1, pageSize: 20,
  };
  const [{ rows, total, page, pageSize }, health] = await Promise.all([getIncidentsFiltered(filters), getSystemHealth()]);

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · {staff.role}</p>
          <h1 className="admin__title">Incidents</h1>
          <p className="admin__count">Related notifications grouped by root cause — with owners, teams, notes & checklists</p>
        </div>
        <div className="inc-subnav">
          <Link href="/admin/incidents/analytics" className="op-item__btn">📊 Health &amp; Analytics</Link>
          <Link href="/admin/incidents/config" className="op-item__btn">⚙ Config</Link>
          <RunCorrelation />
        </div>
      </header>

      <HealthStrip health={health} />

      <IncidentFilterBar total={total} page={page} pageSize={pageSize} />

      {rows.length ? (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Incident</th><th>Priority</th><th>Conf.</th><th>Category</th><th>Root cause</th><th>Severity</th><th>Status</th><th>SLA</th><th>Team</th><th>Orders</th><th>Started</th><th>Assigned</th><th></th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/admin/incidents/${i.number}`} className="admin__mono od-link">{i.number}</Link>
                    <div className="admin__muted" style={{ fontSize: 12 }}>{i.title}{i.snoozedUntil && new Date(i.snoozedUntil) > new Date() ? " · 💤" : ""}{i.parentIncidentId ? " · 🔗 grouped" : ""}{i.escalationLevel > 0 ? ` · ⏫ L${i.escalationLevel}` : ""}</div>
                  </td>
                  <td>{i.priority ? <span className="inc-prio" data-p={i.priority}>{i.priority.toUpperCase()}</span> : "—"}</td>
                  <td className="admin__mono">{i.confidence != null ? `${i.confidence}%` : "—"}</td>
                  <td>{i.categoryLabel}</td>
                  <td className="admin__muted">{i.rootCauseSystem ? ROOT_CAUSE_LABEL[i.rootCauseSystem as RootCauseSystem] ?? i.rootCauseSystem : "—"}</td>
                  <td><span className="inc-sev" data-s={i.severity}>{SEV_ICON[i.severity]} {i.severity}</span></td>
                  <td><span className="inc-status" data-s={i.status}>{i.status}</span></td>
                  <td>{i.slaBreached ? <span className="inc-slatag inc-slatag--breached">Breached</span> : i.slaDueAt && !i.resolvedAt ? <span className="inc-slatag">{Math.round((new Date(i.slaDueAt).getTime() - Date.now()) / 60000)}m</span> : "—"}</td>
                  <td className="admin__muted">{i.team ? TEAM_LABEL[i.team as keyof typeof TEAM_LABEL] ?? i.team : "—"}</td>
                  <td className="admin__mono">{i.affectedOrders}</td>
                  <td className="admin__muted">{ago(i.startedAt)}</td>
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
          <p className="no-alerts__title">No incidents match</p>
          <p className="no-alerts__sub">Incidents open automatically when correlated failures cross a rule threshold. Notifications continue to work as normal.</p>
        </div>
      )}
    </main>
  );
}
