-- Analytics Milestone 2 · Stage 4 (Charts) — daily customers series for the Customers trend chart.
-- Reuses the Stage-1 MV pattern (no duplicate infra): a second daily materialized view for distinct
-- customers, and a VERSIONED series RPC `analytics_daily_series_v2` that adds a `customers` column
-- (v1 is left untouched per the RPC-versioning ADR). Derived from `orders` only; service-role only.

-- Distinct paid customers per day (user_id, or email for guests).
create materialized view if not exists public.analytics_mv_daily_customers as
  select
    date_trunc('day', placed_at)::date                 as day,
    count(distinct coalesce(user_id::text, email))     as customers
  from public.orders
  where payment_status in ('paid', 'partially_refunded', 'refunded')
  group by 1;

create unique index if not exists analytics_mv_daily_customers_day_idx
  on public.analytics_mv_daily_customers (day);

grant select on public.analytics_mv_daily_customers to service_role;

-- Series v2 = order metrics + customers by day (v1 unchanged; charts read v2).
create or replace function public.analytics_daily_series_v2(p_window_days int default 30)
returns table (day date, orders bigint, revenue numeric, customers bigint)
language sql
stable
as $$
  select m.day, m.orders, m.revenue, coalesce(c.customers, 0) as customers
  from public.analytics_mv_daily_order_metrics m
  left join public.analytics_mv_daily_customers c on c.day = m.day
  where m.day >= (current_date - greatest(1, p_window_days))
  order by m.day;
$$;

grant execute on function public.analytics_daily_series_v2(int) to service_role;

-- Refresh BOTH analytics MVs (order metrics + customers).
create or replace function public.analytics_refresh_mvs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.analytics_mv_daily_order_metrics;
  refresh materialized view concurrently public.analytics_mv_daily_customers;
end;
$$;

grant execute on function public.analytics_refresh_mvs() to service_role;
