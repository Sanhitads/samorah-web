import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getSystemHealth, getIncidentAnalytics, getDependencyGraph } from "@/services/incidentService";
import { HealthStrip, HealthHeatmap } from "@/components/admin/IncidentHealth";
import { DependencyGraph } from "@/components/admin/DependencyGraph";

/** Operations intelligence — Health Dashboard + Analytics (Phase 3). Server-rendered. */
export const metadata: Metadata = { title: "Incident Analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmtDur = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);

export default async function IncidentAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;
  const days = sp.days ? Number(sp.days) : 90;
  const [health, a, depGraph] = await Promise.all([getSystemHealth(), getIncidentAnalytics(days), getDependencyGraph()]);
  const maxMonthly = Math.max(1, ...a.monthly.map((m) => m.opened));

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Intelligence</p>
          <h1 className="admin__title">Health &amp; Analytics</h1>
          <p className="admin__count">Deterministic operational intelligence — every number traces to concrete incidents. Window: last {a.windowDays} days.</p>
        </div>
        <nav className="inc-subnav">
          <Link href="/admin/incidents" className="op-item__btn">← Incidents</Link>
          <Link href="/admin/incidents?status=all" className="op-item__btn">Archive</Link>
          <Link href="/admin/incidents/config" className="op-item__btn">⚙ Config</Link>
          {[30, 90, 365].map((d) => <Link key={d} href={`/admin/incidents/analytics?days=${d}`} className={`op-item__btn${d === a.windowDays ? " is-active" : ""}`}>{d}d</Link>)}
        </nav>
      </header>

      <h2 className="od-card__title" style={{ marginBottom: 8 }}>Operational heatmap</h2>
      <HealthHeatmap health={health} />
      <HealthStrip health={health} />

      {/* KPI cards */}
      <div className="inc-kpis">
        <div className="inc-kpi"><span className="inc-kpi__v">{a.total}</span><span className="inc-kpi__k">Incidents ({a.windowDays}d)</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.open}</span><span className="inc-kpi__k">Currently open</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.resolved}</span><span className="inc-kpi__k">Resolved</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{fmtDur(a.mttdMin)}</span><span className="inc-kpi__k">Mean time to detect</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{fmtDur(a.mttrMin)}</span><span className="inc-kpi__k">Mean time to resolve</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{fmtDur(a.avgResolutionMin)}</span><span className="inc-kpi__k">Avg resolution</span></div>
      </div>

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Top incident types</h2>
          {a.topTypes.length ? (
            <ul className="inc-bars">
              {a.topTypes.map((t) => {
                const max = Math.max(1, ...a.topTypes.map((x) => x.count));
                return <li key={t.key} className="inc-bars__row"><span className="inc-bars__label">{t.label}</span><span className="inc-bars__track"><span className="inc-bars__fill" style={{ width: `${(t.count / max) * 100}%` }} /></span><span className="inc-bars__n">{t.count}</span></li>;
              })}
            </ul>
          ) : <p className="admin__muted">No incidents in window.</p>}
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Most common root causes</h2>
          {a.topRootCauses.length ? (
            <ul className="inc-bars">
              {a.topRootCauses.map((t) => {
                const max = Math.max(1, ...a.topRootCauses.map((x) => x.count));
                return <li key={t.key} className="inc-bars__row"><span className="inc-bars__label">{t.label}</span><span className="inc-bars__track"><span className="inc-bars__fill inc-bars__fill--alt" style={{ width: `${(t.count / max) * 100}%` }} /></span><span className="inc-bars__n">{t.count}</span></li>;
              })}
            </ul>
          ) : <p className="admin__muted">No root-cause data.</p>}
        </section>
      </div>

      <section className="od-card">
        <h2 className="od-card__title">Monthly trends</h2>
        {a.monthly.length ? (
          <div className="inc-trend">
            {a.monthly.map((m) => (
              <div key={m.month} className="inc-trend__col" title={`${m.month}: ${m.opened} opened, ${m.resolved} resolved`}>
                <span className="inc-trend__bars">
                  <span className="inc-trend__bar inc-trend__bar--opened" style={{ height: `${(m.opened / maxMonthly) * 100}%` }} />
                  <span className="inc-trend__bar inc-trend__bar--resolved" style={{ height: `${(m.resolved / maxMonthly) * 100}%` }} />
                </span>
                <span className="inc-trend__m">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        ) : <p className="admin__muted">No trend data yet.</p>}
        <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}><span className="inc-trend__key inc-trend__key--opened" /> Opened &nbsp; <span className="inc-trend__key inc-trend__key--resolved" /> Resolved</p>
      </section>

      <section className="od-card">
        <h2 className="od-card__title">System dependency graph</h2>
        <DependencyGraph graph={depGraph} />
      </section>
    </main>
  );
}
