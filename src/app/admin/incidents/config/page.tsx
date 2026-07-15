import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { listSuppressionRules, listMaintenanceWindows, getIncidentsFiltered } from "@/services/incidentService";
import { ConfigManager, SimulationLauncher, DeleteSimulation } from "@/components/admin/IncidentEnterprise";

/** Ops configuration (Phase 4) — suppression rules, maintenance windows, and fire drills. */
export const metadata: Metadata = { title: "Incident Config", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function IncidentConfigPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const [suppressions, maintenance, sims] = await Promise.all([
    listSuppressionRules(), listMaintenanceWindows(),
    getIncidentsFiltered({ status: "all", includeSimulations: true, pageSize: 100 }),
  ]);
  const simRows = sims.rows.filter((r) => r.isSimulation);

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Configuration</p>
          <h1 className="admin__title">Suppression, maintenance &amp; drills</h1>
          <p className="admin__count">Gate noisy incident creation and rehearse the response — all configurable, all audited.</p>
        </div>
        <nav className="inc-subnav">
          <Link href="/admin/incidents" className="op-item__btn">← Incidents</Link>
          <Link href="/admin/incidents/analytics" className="op-item__btn">📊 Analytics</Link>
        </nav>
      </header>

      <ConfigManager suppressions={suppressions} maintenance={maintenance} />

      <section className="od-card">
        <h2 className="od-card__title">Fire drill / simulation</h2>
        <p className="admin__muted" style={{ fontSize: 12 }}>Create a flagged incident to exercise routing, escalation and notifications. Simulations are excluded from health, analytics and metrics, and never send real pages.</p>
        <SimulationLauncher />
        {simRows.length ? (
          <div style={{ marginTop: 14 }}>
            <h3 className="od-card__title" style={{ fontSize: "1rem" }}>Active drills ({simRows.length})</h3>
            {simRows.map((s) => (
              <div key={s.id} className="od-line">
                <Link href={`/admin/incidents/${s.number}`} className="admin__mono od-link">{s.number}</Link>
                <span className="admin__muted">{s.title}</span>
                <span className="inc-status" data-s={s.status}>{s.status}</span>
                <DeleteSimulation number={s.number} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
