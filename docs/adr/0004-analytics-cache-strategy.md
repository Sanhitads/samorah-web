# ADR 0004 — Analytics cache strategy

**Status:** Accepted (Milestone 2 · Stage 1)

## Context
Analytics blends first-party data (live, our DB) with external cached sources (GA4, Clarity, Razorpay)
that have very different freshness needs and hard API rate caps. Cache TTLs were scattered as literals
across services, making them hard to reason about or tune per environment.

## Decision
Centralise all cache durations in `src/lib/analytics/cacheConfig.ts` (`cacheMs`/`cacheSeconds`), with a
default per source and a per-environment override `ANALYTICS_CACHE_<KEY>_MS`:
- **First-party KPI snapshot:** 60 s via `unstable_cache` — near-real-time, cheap to recompute.
- **Daily series (MV-backed):** 5 min.
- **External:** GA4 2 min, Clarity 6 h (stays under its 10/day cap), Razorpay 1 h — the existing services
  now read these from the central config instead of inline literals.
Every cached/external source also reports **data-freshness** (last updated / cache age / availability) so
staleness is visible rather than hidden.

## Consequences
- One knob per source; env overrides tune freshness vs. load without code changes.
- Operators see cache age; stale external data degrades gracefully with source-specific messaging.
- A future runtime/DB-backed override store can plug into `cacheConfig` without touching call sites.
