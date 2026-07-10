-- Content locking (review point 8) — advisory "currently edited by X" for CMS
-- resources, so two editors don't silently clobber each other. A lock is a single
-- row per resource with a heartbeat; it's advisory (warns, never hard-blocks) and
-- goes stale after ~90s without a refresh. Generic: keyed by resource (page:homepage,
-- email:order.confirmed, …).

create table if not exists public.cms_locks (
  resource_key varchar(80) primary key,
  actor_id     uuid,
  actor_name   text,
  locked_at    timestamptz not null default now()
);

alter table public.cms_locks enable row level security;
grant all on public.cms_locks to service_role;
