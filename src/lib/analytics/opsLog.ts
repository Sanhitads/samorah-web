/**
 * Analytics OPERATIONAL event logging (ops diagnostics only — NOT product/tagging analytics; that lives in
 * events.ts). A thin, typed structured logger so we can trace dashboard refreshes, exports, RPC/source
 * failures and disabled widgets. Server-only usage.
 *
 * STORAGE (today): events are written as a single structured stdout line prefixed `[analytics] <event>`
 * with a JSON payload, captured by the platform log drain (Vercel deployment logs / any configured drain).
 * QUERY (today): search those logs by the `[analytics]` prefix and/or the event name (e.g. `rpc.failed`,
 * `source.unavailable`) in the Vercel dashboard or the drain's search UI. No table, no query API yet.
 *
 * PLANNED PERSISTENCE (deferred — Milestone 2 later stage / M3 "Smart Alerts"): route `emit()` to a
 * durable sink — either a new `analytics_ops_events` table (event, at, meta jsonb; service-role RLS) read
 * by an ops panel, or reuse the existing `audit_events` stream. Only `emit()` changes; every call site
 * stays the same. Until then these are best-effort log lines, safe to lose.
 */
export type AnalyticsOpsEvent =
  | "dashboard.refresh"
  | "export.generated"
  | "goal.updated"
  | "chart.render_failed"
  | "source.unavailable" // e.g. GA4 / Clarity down
  | "widget.disabled"
  | "rpc.failed";

export interface AnalyticsOpsRecord {
  event: AnalyticsOpsEvent;
  at: string; // ISO timestamp
  meta?: Record<string, unknown>;
}

function emit(r: AnalyticsOpsRecord): void {
  // Single sink. Structured line is picked up by the platform log drain. Swap for a persistent ops
  // store later without changing any call site.
  // eslint-disable-next-line no-console
  console.info(`[analytics] ${r.event}`, JSON.stringify({ at: r.at, ...(r.meta ?? {}) }));
}

/** Record an analytics ops event. Never throws — logging must not break a dashboard render. */
export function logAnalyticsOps(event: AnalyticsOpsEvent, meta?: Record<string, unknown>): void {
  try {
    emit({ event, at: new Date().toISOString(), meta });
  } catch {
    /* best-effort */
  }
}
