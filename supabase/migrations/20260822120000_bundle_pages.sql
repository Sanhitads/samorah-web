-- ============================================================================
-- Bundle CMS — Phase 0 foundation. Additive only; no existing/frozen migration touched.
--
-- One publishable singleton per bundle (keyed by bundle_key), mirroring the composed_pages
-- pattern MINUS scheduling (launch lifecycle is Draft → Preview → Publish only). Holds the
-- editorial BundleConfig jsonb (draft vs published). It NEVER stores pricing/inventory values —
-- discount stays owned by the pricing domain (BUNDLE_DISCOUNT) and availability by the catalog
-- (variants.stock via isInStock). RLS: service-role only, exactly like composed_pages — the
-- storefront reads it server-side via createAdminClient(); there is NO public read policy.
-- Revisions reuse the shared cms_revisions table (resource_type='bundle') — no new revision store.
-- ============================================================================

create table if not exists public.bundle_pages (
  bundle_key  varchar(40) primary key default 'discovery',
  draft       jsonb,
  published   jsonb,
  status      varchar(20) not null default 'draft' check (status in ('draft','published')),
  updated_at  timestamptz not null default now()
);

alter table public.bundle_pages enable row level security;
grant all on public.bundle_pages to service_role;
-- No anon/authenticated grant and no public policy: bundle config is server-read only
-- (createAdminClient), matching composed_pages. Storefront renders the DEFAULT_BUNDLE_CONFIG
-- fallback in code when no published row exists (parity with the current hard-coded page).
