-- Analytics Milestone 2 · Stage 1 (Foundation) — optimized data layer.
-- Moves the hot KPI aggregation off the JavaScript path (which fetched capped row sets — PostgREST's
-- 1000-row default silently truncated large windows and undercounted — and reduced in memory) onto
-- SERVER-SIDE SQL: a single-query current+previous KPI snapshot RPC, a daily-metrics materialized view
-- for trend series, and a partial index so window scans stay cheap at scale. Derived entirely from the
-- existing `orders` table — no new business data, no duplicate authority. Service-role only.
--
-- NAMING CONVENTION (scales as more analytics objects are added):
--   • materialized views   → analytics_mv_<subject>        (analytics_mv_daily_order_metrics)
--   • read RPCs (versioned  → analytics_<subject>_v<N>       (analytics_kpi_snapshot_v1)
--     by RESULT SHAPE; add a _v2 alongside _v1 for a breaking shape change, never mutate _v1)
--   • maintenance RPCs      → analytics_<action>             (analytics_refresh_mvs)
--   • supporting indexes on a domain table keep the domain name (orders_paid_placed_at_idx).

-- Partial index: window scans over PAID orders by placed_at (drives the snapshot RPC + MV refresh).
create index if not exists orders_paid_placed_at_idx
  on public.orders (placed_at)
  where payment_status in ('paid', 'partially_refunded', 'refunded');

-- ── analytics_kpi_snapshot_v1 · current + previous-period KPI snapshot in ONE query (always fresh) ──
-- Returns the current window, the immediately-preceding equal window (for % change), and today vs
-- yesterday (for the Executive Summary "…Today" cards). Only the last two windows are scanned.
create or replace function public.analytics_kpi_snapshot_v1(p_window_days int default 30)
returns table (
  cur_orders    bigint,
  cur_revenue   numeric,
  prev_orders   bigint,
  prev_revenue  numeric,
  today_orders  bigint,
  today_revenue numeric,
  yday_orders   bigint,
  yday_revenue  numeric
)
language sql
stable
as $$
  with b as (
    select
      now() - make_interval(days => greatest(1, p_window_days))     as cur_start,
      now() - make_interval(days => 2 * greatest(1, p_window_days)) as prev_start,
      date_trunc('day', now())                                      as today_start,
      date_trunc('day', now()) - interval '1 day'                   as yday_start
  )
  select
    count(*)                       filter (where o.placed_at >= b.cur_start)                                    as cur_orders,
    coalesce(sum(o.total_amount)   filter (where o.placed_at >= b.cur_start), 0)                                as cur_revenue,
    count(*)                       filter (where o.placed_at >= b.prev_start and o.placed_at < b.cur_start)     as prev_orders,
    coalesce(sum(o.total_amount)   filter (where o.placed_at >= b.prev_start and o.placed_at < b.cur_start), 0) as prev_revenue,
    count(*)                       filter (where o.placed_at >= b.today_start)                                  as today_orders,
    coalesce(sum(o.total_amount)   filter (where o.placed_at >= b.today_start), 0)                              as today_revenue,
    count(*)                       filter (where o.placed_at >= b.yday_start and o.placed_at < b.today_start)   as yday_orders,
    coalesce(sum(o.total_amount)   filter (where o.placed_at >= b.yday_start and o.placed_at < b.today_start), 0) as yday_revenue
  from public.orders o, b
  where o.payment_status in ('paid', 'partially_refunded', 'refunded')
    and o.placed_at >= b.prev_start;
$$;

grant execute on function public.analytics_kpi_snapshot_v1(int) to service_role;

-- ── analytics_mv_daily_order_metrics · daily buckets (powers Stage-4 trend charts + windowed series) ──
create materialized view if not exists public.analytics_mv_daily_order_metrics as
  select
    date_trunc('day', placed_at)::date as day,
    count(*)                           as orders,
    coalesce(sum(total_amount), 0)     as revenue
  from public.orders
  where payment_status in ('paid', 'partially_refunded', 'refunded')
  group by 1;

-- Unique index → enables REFRESH … CONCURRENTLY (non-blocking refresh).
create unique index if not exists analytics_mv_daily_order_metrics_day_idx
  on public.analytics_mv_daily_order_metrics (day);

grant select on public.analytics_mv_daily_order_metrics to service_role;

-- Windowed daily series from the MV (server-side; consumed by charts in Stage 4).
create or replace function public.analytics_daily_series_v1(p_window_days int default 30)
returns table (day date, orders bigint, revenue numeric)
language sql
stable
as $$
  select m.day, m.orders, m.revenue
  from public.analytics_mv_daily_order_metrics m
  where m.day >= (current_date - greatest(1, p_window_days))
  order by m.day;
$$;

grant execute on function public.analytics_daily_series_v1(int) to service_role;

-- Maintenance: refresh all analytics MVs (called by the /api/cron/analytics-refresh worker).
create or replace function public.analytics_refresh_mvs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.analytics_mv_daily_order_metrics;
end;
$$;

grant execute on function public.analytics_refresh_mvs() to service_role;
