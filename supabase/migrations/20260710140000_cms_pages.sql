-- CMS — Pages (Phase 5, slice 1). The content model for editable storefront pages
-- (policies, info, about, journal…). A page = eyebrow + title + intro + ordered
-- sections (heading + paragraphs) + SEO + publish status. The storefront reads the
-- PUBLISHED row and falls back to config when absent — so existing pages keep
-- working and become editable the moment a row is created. Foundation the other CMS
-- managers (homepage, nav, email) extend.

create table if not exists public.cms_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       varchar(120) not null unique,   -- shipping, returns, about-our-story, …
  title      varchar(200) not null,
  eyebrow    varchar(80),
  intro      text,
  sections   jsonb not null default '[]'::jsonb,  -- [{heading, body: string[]}]
  seo        jsonb not null default '{}'::jsonb,  -- {title, description, ogImage}
  status     varchar(20) not null default 'published' check (status in ('draft','published')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cms_pages_status_idx on public.cms_pages (status);

alter table public.cms_pages enable row level security;
grant all on public.cms_pages to service_role;
-- Read is via the service-role client (SSR); a public read policy can be added
-- later if pages are fetched client-side.
