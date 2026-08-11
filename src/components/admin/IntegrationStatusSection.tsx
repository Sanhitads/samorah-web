import {
  getIntegrationStatuses, summarizeIntegrations, launchReadiness, getEnvironmentInfo,
  type IntegrationStatus,
} from "@/services/settingsIntegrationsService";
import { INTEGRATION_REGISTRY_VERSION, type IntegrationSeverity } from "@/lib/settings/integrationRegistry";
import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import { NotificationTestButton } from "@/components/admin/NotificationTestButton";

/**
 * Integration Status section (Settings · Phase S1A) — read-only operational visibility. Rendered ONLY from
 * the Integration Registry via the Aggregator; standard Healthy/Warning/Critical/Unknown severity (reusing
 * the Reports Financial Health visual language: icon + label + accent, never colour-only), diagnostic reason
 * + Recommended Action, configuration provenance, last successful communication + its source, an Integration
 * Health summary, and a Launch Readiness checklist — all from existing service health only. "Managed by
 * Environment Variables." A failing/slow integration degrades only its own panel.
 */
const ICON: Record<IntegrationSeverity, string> = { healthy: "✓", warning: "⚠", critical: "⛔", unknown: "•" };
const LABEL: Record<IntegrationSeverity, string> = { healthy: "Healthy", warning: "Warning", critical: "Critical", unknown: "Unknown" };

function Panel({ s }: { s: IntegrationStatus }) {
  return (
    <div className="int-panel" data-sev={s.severity}>
      <div className="int-panel__head">
        <span className="int-panel__badge">{ICON[s.severity]} {LABEL[s.severity]}</span>
        <span className="int-panel__provider">{s.provider}</span>
      </div>
      <p className="int-panel__reason">{s.reason}{s.extraIssues > 0 ? ` · +${s.extraIssues} more` : ""}</p>
      {s.recommendedAction ? <p className="int-panel__action">→ {s.recommendedAction}</p> : null}
      {s.lastSuccessAt ? (
        <p className="admin__muted int-panel__meta">Last activity {cacheAgeLabel(Date.parse(s.lastSuccessAt))}{s.timestampSource ? ` · ${s.timestampSource}` : ""}</p>
      ) : null}
      <p className="admin__muted int-panel__meta">Config: {s.configurationSource} · Owner: {s.serviceOwner}</p>
      {s.id === "notifications" ? <NotificationTestButton /> : null}
    </div>
  );
}

export async function IntegrationStatusSection() {
  // Integration health must NEVER block the page — this section fails closed to a calm fallback.
  let statuses: IntegrationStatus[];
  try {
    statuses = await getIntegrationStatuses();
  } catch {
    return (
      <section className="cfg-section">
        <div className="ash-jump__head">
          <h2 className="cfg-section__title">Integration status</h2>
          <span className="admin__muted">Managed by Environment Variables · read-only</span>
        </div>
        <p className="admin__empty">Integration status is temporarily unavailable — the Settings below are unaffected.</p>
      </section>
    );
  }
  const summary = summarizeIntegrations(statuses);
  const readiness = launchReadiness(statuses);
  const env = getEnvironmentInfo();

  return (
    <section className="cfg-section">
      <div className="ash-jump__head">
        <h2 className="cfg-section__title">Integration status</h2>
        <span className="admin__muted">Managed by Environment Variables · read-only · registry {INTEGRATION_REGISTRY_VERSION}</span>
      </div>

      <div className="an-fresh int-summary" role="group" aria-label="Integration health summary">
        <span className="an-fresh__chip">Environment: {env.environment}</span>
        {env.commit ? <span className="an-fresh__chip">Build {env.commit}</span> : null}
        <span className="int-count" data-sev="healthy">{ICON.healthy} {summary.healthy} Healthy</span>
        <span className="int-count" data-sev="warning">{ICON.warning} {summary.warning} Warning</span>
        <span className="int-count" data-sev="critical">{ICON.critical} {summary.critical} Critical</span>
        {summary.unknown ? <span className="int-count" data-sev="unknown">{ICON.unknown} {summary.unknown} Unknown</span> : null}
      </div>

      <div className="int-grid">
        {statuses.map((s) => <Panel key={s.id} s={s} />)}
      </div>

      <p className="cfg-sub">Launch readiness</p>
      <ul className="int-readiness" aria-label="Launch readiness">
        {readiness.map((r) => (
          <li key={r.id} data-ok={r.ok ? "1" : "0"}>{r.ok ? "✓" : "○"} {r.label}</li>
        ))}
      </ul>
      <p className="cfg-hint">Derived entirely from existing service health — read-only. Integration status never blocks editing or saving Settings below.</p>
    </section>
  );
}
