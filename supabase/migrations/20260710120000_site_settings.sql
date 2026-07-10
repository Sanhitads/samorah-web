-- Site settings (Phase 2 / OS Point 11) — the CMS backbone. A singleton JSONB blob
-- holding the NON-money-critical, presentation/content settings the business should
-- edit without a deploy: brand, support, social links, SEO defaults, analytics id,
-- announcement bar. Money-critical config (GST rate, store state, payment keys)
-- stays in config/commerce.ts by design (money-engine source of truth) — surfaced
-- read-only in the admin. The service merges this over the config defaults, so an
-- empty/absent row changes nothing.

create table if not exists public.site_settings (
  id         boolean primary key default true check (id),  -- single row
  data       jsonb   not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
grant all on public.site_settings to service_role;
-- Public read of a curated subset would be nice later; for now the server reads it
-- via the service-role client (SSR), never the browser.

insert into public.site_settings (id, data) values (true, '{}'::jsonb) on conflict (id) do nothing;
