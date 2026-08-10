# Analytics — production observability roadmap (documentation only)

Forward-looking note on integrating analytics with production observability. **No runtime code is
introduced by this document**; it records the intended direction so later milestones can plan for it.

## Today (Stage 1)
- Operational events are emitted as structured log lines via `src/lib/analytics/opsLog.ts`
  (`[analytics] <event>` + JSON), captured by the platform log drain and searchable in Vercel logs.
- Data-freshness (`src/lib/analytics/dataFreshness.ts`) surfaces source cache age / availability in-app.
- A Stage-1 performance baseline is recorded in `docs/performance/analytics-stage1.md`.

## Future integration (not scheduled; each needs its own approval)
- **Tracing — OpenTelemetry:** wrap analytics service calls + SQL RPCs in spans (dashboard load → service
  → RPC), export via OTLP. Gives per-query latency and a request waterfall.
- **Metrics — Prometheus / OTel metrics:** counters + histograms for RPC latency, cache hit/miss ratio
  (the counter noted as "not yet instrumented" in the Stage-1 benchmark), query count per dashboard load,
  and MV refresh duration/success.
- **Errors + performance — Sentry:** capture `rpc.failed` / `source.unavailable` / `chart.render_failed`
  (the `opsLog` events) as issues, plus Web-Vitals for the admin dashboard routes.
- **Durable ops log:** route `opsLog.emit()` to a persistent sink (`analytics_ops_events` table or reuse
  `audit_events`) so ops events are queryable via an API, not just log search.

## Principles when adopted
Keep it reuse-first and modular (one instrumentation layer, not per-widget); respect RBAC; no PII in
metrics/traces; sample in production; and make instrumentation independently toggleable like the widgets.
