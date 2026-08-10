# ADR 0001 — Analytics RPC versioning

**Status:** Accepted (Milestone 2 · Stage 1)

## Context
Analytics read RPCs return typed result shapes consumed by services and, downstream, the UI. Silently
changing a shipped RPC's columns would break callers (and any cached/typed clients) without warning.

## Decision
- **Read RPCs are versioned by RESULT SHAPE:** `analytics_<subject>_v<N>` (e.g. `analytics_kpi_snapshot_v1`,
  `analytics_daily_series_v1`).
- A shipped `_vN` is **never mutated**. A breaking shape change ships a new `analytics_<subject>_v(N+1)`
  **alongside** the old one; consumers migrate, then the old version is retired in a later, explicit step.
- **Maintenance RPCs** with no result-shape contract are unversioned: `analytics_<action>` (e.g.
  `analytics_refresh_mvs`).
- **Materialized views:** `analytics_mv_<subject>`. Supporting indexes on a domain table keep the domain
  name (`orders_paid_placed_at_idx`).

## Consequences
- Forward-compatible; multiple versions may briefly coexist during a migration.
- Typed clients (`src/lib/analytics/rpc.ts`) map 1:1 to a versioned RPC.
- Slightly more verbose names — accepted for the safety guarantee.
