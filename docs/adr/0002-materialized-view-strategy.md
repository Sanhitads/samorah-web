# ADR 0002 — Materialized-view strategy

**Status:** Accepted (Milestone 2 · Stage 1)

## Context
Trend/series widgets (Stage 4) need daily buckets over `orders`. Aggregating the full history per request
in JavaScript is slow, memory-heavy, and — via PostgREST's 1000-row cap — silently incorrect at scale.
KPI cards, by contrast, must be accurate and near-real-time.

## Decision
Split by freshness need:
- **Series / charts → materialized view** `analytics_mv_daily_order_metrics` (day, orders, revenue),
  refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY` (a unique index on `day` enables the concurrent,
  non-blocking refresh) via `analytics_refresh_mvs()`, invoked by the `/api/cron/analytics-refresh` cron
  every 15 minutes.
- **KPI snapshot → live RPC** `analytics_kpi_snapshot_v1` reads the base `orders` table directly (always
  fresh), aggregating server-side over an index-backed partial scan of only the current + previous windows.

## Consequences
- Series data can be up to the refresh interval stale — surfaced through the data-freshness indicators.
- Refresh cost is amortized off the request path; reads are cheap.
- MVs are additive and safely droppable; adding more follows the `analytics_mv_<subject>` convention and
  is added to `analytics_refresh_mvs()`.
- KPIs stay exact and current; only trend series trade freshness for speed.
