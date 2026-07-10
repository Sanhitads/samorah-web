-- Composable Page framework (review: generalize the Homepage Builder). One generic
-- table for EVERY composed editorial page — homepage, about, journal, landing… —
-- keyed by page_key. The Homepage Builder becomes just consumer #1; a new page type
-- is a row here + a registration, not a new table or service.
--
-- Each page is a publishable resource (point-14 pattern): draft vs published section
-- list + a publish window. The old `homepage` singleton migrates into page_key='homepage'.

create table if not exists public.composed_pages (
  page_key     varchar(40) primary key,
  draft        jsonb,
  published    jsonb,
  status       varchar(20) not null default 'published' check (status in ('draft','scheduled','published')),
  publish_at   timestamptz,
  unpublish_at timestamptz,
  updated_at   timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='homepage') then
    insert into public.composed_pages (page_key, draft, published, status, publish_at, unpublish_at, updated_at)
      select 'homepage', draft, published, status, publish_at, unpublish_at, updated_at from public.homepage where id = true
      on conflict (page_key) do nothing;
    drop table public.homepage;
  end if;
end $$;

alter table public.composed_pages enable row level security;
grant all on public.composed_pages to service_role;
