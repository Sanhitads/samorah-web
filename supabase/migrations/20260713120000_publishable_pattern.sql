-- Publishable Resource pattern (review point 14) — one shared spine for every
-- CMS-managed resource (pages, navigation, homepage, blog, email…) so they all
-- behave identically: draft vs published content, a publish window, and revision
-- history with restore.
--
-- 1) Unified revision store — ONE table keyed by (resource_type, resource_key)
--    replaces per-resource *_revisions tables. Any resource snapshots + restores
--    through the same helpers (src/services/cms/revisions.ts).

create table if not exists public.cms_revisions (
  id            uuid primary key default gen_random_uuid(),
  resource_type varchar(40)  not null,   -- 'page' | 'navigation' | 'homepage' | …
  resource_key  varchar(160) not null,   -- slug | menu id | 'homepage'
  snapshot      jsonb        not null,   -- the full committed content
  label         text,                    -- optional human note ("before Diwali")
  actor_id      uuid,
  created_at    timestamptz  not null default now()
);
create index if not exists cms_revisions_lookup_idx on public.cms_revisions (resource_type, resource_key, created_at desc);
alter table public.cms_revisions enable row level security;
grant all on public.cms_revisions to service_role;

-- 2) Navigation becomes publishable — draft vs published + a publish window.
--    (Was a single `data` column.) Existing data migrates into BOTH draft and
--    published so nothing changes visually.
alter table public.navigation_menus add column if not exists draft        jsonb;
alter table public.navigation_menus add column if not exists published    jsonb;
alter table public.navigation_menus add column if not exists status       varchar(20) not null default 'published';
alter table public.navigation_menus add column if not exists publish_at   timestamptz;
alter table public.navigation_menus add column if not exists unpublish_at timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name='navigation_menus' and column_name='data') then
    update public.navigation_menus set published = coalesce(published, data), draft = coalesce(draft, data);
    alter table public.navigation_menus drop column data;
  end if;
end $$;

alter table public.navigation_menus drop constraint if exists navigation_menus_status_check;
alter table public.navigation_menus add constraint navigation_menus_status_check check (status in ('draft','scheduled','published'));
