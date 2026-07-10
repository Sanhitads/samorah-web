-- CMS Slice 3 — Navigation Manager. Header mega-menu + footer, editable without code.
--
-- Stored as one JSONB tree per menu ('header' = mega-menu branches, 'footer' =
-- footer sections) — the shape mirrors src/config/navigation.ts exactly, so the
-- storefront reads DB→config-fallback (like cms_pages): existing menus keep working
-- and become editable the moment a row is saved. Campaign imagery references a
-- Media Library id (single-source rule), resolved to a URL at read time.

create table if not exists public.navigation_menus (
  id         varchar(20) primary key check (id in ('header','footer')),
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.navigation_menus enable row level security;
grant all on public.navigation_menus to service_role;
