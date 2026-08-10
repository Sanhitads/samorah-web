# Analytics — Stage 1 performance baseline

Baseline captured at Milestone 2 · Stage 1 (Foundation) so later milestones can detect regressions.
Method: local Supabase seeded with **8,000 paid orders** over 120 days; 30-day window (~2,014 orders).
Compared the old JavaScript path (fetch rows via PostgREST + reduce in JS) against the new server-side
RPC `analytics_kpi_snapshot_v1`.

| Metric | Old JS path | New RPC path |
|---|---|---|
| SQL execution (EXPLAIN ANALYZE) | — (client-side reduce) | **4.87 ms**, Index Scan on `orders_paid_placed_at_idx` (scans only current+previous windows) |
| Round-trips (KPI snapshot) | 1 fetch → 1000 rows (full overview = **5** round-trips, incl. an **unbounded** customer-LTV query) | **1** call → **1** row |
| Row transfer | 1000 (PostgREST 1000-row cap) | 1 |
| Correctness | ₹742,800 / 1000 orders — **undercounted** (truncated) | ₹1,499,950 / 2014 orders — **correct** |
| Memory (Node heapUsed Δ) | 2,282 KB | **151 KB (~15× less)** |
| Latency (avg 30×, localhost) | 15.5 ms | 12.7 ms (**1.22×**) |
| Cache | none | `unstable_cache` 60 s: 1st miss runs RPC, subsequent hits do **0** DB round-trips |
| Bundle-size delta | — | **0 new client JS** (KpiCard is a server component; `lib/analytics/*` server-only), **0 new runtime deps**; cron route **377 B**; **~0.7 KB** CSS; new source ≈ **10 KB gzip** (server-side) |

## Headline
The RPC is **correct where the JS path silently undercounts** (PostgREST 1000-row cap), uses **~15× less
memory**, transfers **1000× fewer rows**, and is index-backed at **<5 ms**. Latency gain is modest on
localhost where network dominates; the correctness + memory + transfer wins grow with dataset size.

## Not yet instrumented (future — see docs/roadmaps/analytics-monitoring.md)
Cache hit/miss ratio counter; per-request query-count metric; production p50/p95 dashboard-load timings.
Re-run this comparison after each milestone that touches the analytics data layer.
