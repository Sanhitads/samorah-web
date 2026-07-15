import type { SystemHealth } from "@/services/incidentService";

/** Health Dashboard strip (Phase 3) — overall + per-subsystem Healthy/Warning/Critical, each with
 *  the deterministic reason it's in that state (hover title). Presentational; no client JS. */
const DOT: Record<string, string> = { healthy: "🟢", warning: "🟡", critical: "🔴" };
const LABEL: Record<string, string> = { healthy: "Healthy", warning: "Warning", critical: "Critical" };

export function HealthStrip({ health }: { health: SystemHealth }) {
  return (
    <section className="inc-health" aria-label="System health">
      <div className={`inc-health__overall inc-health__overall--${health.overall}`}>
        <span className="inc-health__dot">{DOT[health.overall]}</span>
        <span className="inc-health__ov-label">System {LABEL[health.overall]}</span>
      </div>
      <div className="inc-health__grid">
        {health.subsystems.map((s) => (
          <div key={s.subsystem} className={`inc-health__cell inc-health__cell--${s.state}`} title={s.why}>
            <span className="inc-health__name">{s.label}</span>
            <span className="inc-health__state">{DOT[s.state]} {LABEL[s.state]}</span>
            <span className="inc-health__why">{s.why}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
