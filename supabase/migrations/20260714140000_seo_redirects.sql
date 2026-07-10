-- CMS Slice 6 — SEO Manager + Redirects.
--
-- redirects: DB-driven 301/302 from_path → to_path, applied in middleware (cached),
-- so marketing can retire/rename URLs (old campaign links, moved pages) without a
-- deploy. Unique from_path; hit counter for insight.
--
-- seo_overrides: per-route meta/canonical/OG/robots overrides, layered over the
-- global defaults (site_settings.seo). getRouteSeo(path) reads them for generateMetadata.

create table if not exists public.redirects (
  id         uuid primary key default gen_random_uuid(),
  from_path  varchar(300) not null unique,
  to_path    varchar(500) not null,
  code       smallint not null default 301 check (code in (301, 302)),
  enabled    boolean not null default true,
  hits       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists redirects_from_idx on public.redirects (from_path) where enabled;

create table if not exists public.seo_overrides (
  path        varchar(300) primary key,
  title       text,
  description text,
  og_image    text,
  robots      varchar(40),   -- e.g. "noindex,nofollow"
  updated_at  timestamptz not null default now()
);

alter table public.redirects enable row level security;
alter table public.seo_overrides enable row level security;
grant all on public.redirects to service_role;
grant all on public.seo_overrides to service_role;
