-- CMS Slice 4 — Homepage Builder (review points 9 + 10). The homepage is an ORDERED
-- LIST OF TYPED SECTIONS (Shopify-style), NOT one opaque blob: each section is a
-- first-class descriptor { id, type, enabled, sort_order, settings }, independently
-- toggled, reordered and configured. New section types slot in without touching the
-- others.
--
-- It's a PUBLISHABLE resource (reuses the point-14 pattern verbatim): draft vs
-- published section lists + a publish window + revision history via cms_revisions.
-- Singleton row (id=true). Storefront reads `published` (schedule-aware) with a
-- config-default fallback, so the homepage renders before anything is saved.

create table if not exists public.homepage (
  id           boolean primary key default true check (id),
  draft        jsonb,                                  -- Section[] being edited
  published    jsonb,                                  -- Section[] that is live
  status       varchar(20) not null default 'published' check (status in ('draft','scheduled','published')),
  publish_at   timestamptz,
  unpublish_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.homepage enable row level security;
grant all on public.homepage to service_role;
