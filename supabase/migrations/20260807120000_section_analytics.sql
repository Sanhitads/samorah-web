-- Section analytics (Phase 6 · point 26) — first-party, privacy-first per-section event tracking for
-- composable pages (homepage first). Events are ingested by a server endpoint (service-role only), so
-- the table needs no anon policies. Aggregation is done by a stable SQL function for efficiency.
create table if not exists public.section_events (
  id           uuid primary key default gen_random_uuid(),
  page_key     text not null default 'homepage',
  section_id   text not null,
  section_type text,
  event_type   text not null check (event_type in ('view', 'click', 'scroll', 'conversion')),
  session_id   text,
  scroll_pct   int  check (scroll_pct between 0 and 100),
  path         text,
  created_at   timestamptz not null default now()
);

create index if not exists section_events_page_time_idx on public.section_events (page_key, created_at desc);
create index if not exists section_events_section_idx    on public.section_events (page_key, section_id);

alter table public.section_events enable row level security;
-- No policies → only the service_role (server ingest + admin reads) can touch it. Storefront never
-- reads or writes directly; it posts to /api/analytics/section which validates + inserts server-side.
grant select, insert, delete on table public.section_events to service_role;

-- Per-section rollup over the last N days: views / clicks / conversions counts + average scroll depth.
create or replace function public.section_analytics(p_page_key text, p_days int default 30)
returns table (section_id text, views bigint, clicks bigint, conversions bigint, avg_scroll numeric)
language sql
stable
as $$
  select
    section_id,
    count(*) filter (where event_type = 'view')       as views,
    count(*) filter (where event_type = 'click')       as clicks,
    count(*) filter (where event_type = 'conversion')  as conversions,
    round(avg(scroll_pct) filter (where event_type = 'scroll'))::numeric as avg_scroll
  from public.section_events
  where page_key = p_page_key
    and created_at > now() - make_interval(days => greatest(1, p_days))
  group by section_id;
$$;

grant execute on function public.section_analytics(text, int) to service_role;
