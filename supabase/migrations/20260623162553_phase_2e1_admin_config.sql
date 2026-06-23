-- ============================================================================
-- Phase 2E-1 — Admin & config
--
-- Tables:  settings, audit_logs (server-only),  homepage_banners,
--          instagram_gallery (public-read editorial content)
--
-- settings is a flexible key/value store (admin edits without migrations); the
-- GST-critical keys (tax.store_state, tax.gstin) are seeded empty and MUST be
-- filled before the first real order — they drive the CGST/SGST vs IGST split.
-- ============================================================================


-- ── settings (key/value store; super-admin / server only) ──────────────────────
create table public.settings (
  key         varchar(80) primary key,                  -- e.g. 'tax.store_state'
  value       jsonb,
  section     varchar(40),                              -- store|tax|payments|shipping|email|loyalty|general
  label       varchar(160),
  description text,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed the MVP-critical config (admin fills the empty ones before launch).
insert into public.settings (key, value, section, label) values
  ('store.name',              '"Samorah"',       'store',    'Store name'),
  ('store.currency',          '"INR"',           'store',    'Currency'),
  ('store.timezone',          '"Asia/Kolkata"',  'store',    'Timezone'),
  ('store.registered_address','""',              'store',    'Registered business address'),
  ('tax.store_state',         '""',              'tax',      'Seller state (drives CGST/SGST vs IGST)'),
  ('tax.gstin',               '""',              'tax',      'Seller GSTIN'),
  ('tax.price_inclusive',     'true',            'tax',      'Prices are GST-inclusive (MRP)'),
  ('shipping.free_threshold', '1000',            'shipping', 'Free shipping above (INR)'),
  ('shipping.cod_enabled',    'true',            'shipping', 'COD enabled'),
  ('payments.test_mode',      'true',            'payments', 'Razorpay test mode')
on conflict (key) do nothing;


-- ── audit_logs (immutable admin action trail, BRD §20) ─────────────────────────
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,  -- admin who acted
  action      varchar(100) not null,                                -- 'price_changed', 'order_refunded', ...
  entity_type varchar(50),                                          -- 'product', 'order', 'user', 'coupon', ...
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  ip_address  varchar(45),
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_logs_user_id_idx     on public.audit_logs(user_id);
create index audit_logs_entity_idx      on public.audit_logs(entity_type, entity_id);
create index audit_logs_action_idx      on public.audit_logs(action);
create index audit_logs_created_at_idx  on public.audit_logs(created_at desc);


-- ── homepage_banners (Banner Manager slots, BRD §17.2) ─────────────────────────
create table public.homepage_banners (
  id          uuid primary key default gen_random_uuid(),
  slot_key    varchar(60) not null unique,              -- hero|announcement|brand_story|campaign_left|...
  heading     varchar(240),
  subtext     text,
  copy_text   text,                                     -- brand_story
  label       varchar(120),                             -- campaign blocks
  quote_text  text,                                     -- testimonial / footer_quote
  attribution varchar(160),                             -- testimonial
  image_url   text,                                     -- Cloudinary
  cta_text    varchar(120),
  cta_url     varchar(240),
  bg_color    varchar(20),                              -- announcement
  extra       jsonb,                                    -- future-proofing
  is_active   boolean not null default false,
  sort_order  integer not null default 0,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed the eight slots (editors fill + activate them via the Banner Manager).
insert into public.homepage_banners (slot_key, sort_order) values
  ('announcement', 1), ('hero', 2), ('brand_story', 3),
  ('campaign_left', 4), ('campaign_right', 5), ('testimonial', 6),
  ('newsletter_headline', 7), ('footer_quote', 8)
on conflict (slot_key) do nothing;


-- ── instagram_gallery (curated atmosphere grid, BRD §17.4) ─────────────────────
create table public.instagram_gallery (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,                            -- Cloudinary (auto 1:1)
  caption     text,
  link_url    text,
  is_featured boolean not null default false,           -- top 9 shown on homepage
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index instagram_gallery_featured_idx on public.instagram_gallery(is_featured, sort_order);


-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_settings_updated_at          before update on public.settings          for each row execute function public.set_updated_at();
create trigger trg_homepage_banners_updated_at  before update on public.homepage_banners  for each row execute function public.set_updated_at();
create trigger trg_instagram_gallery_updated_at before update on public.instagram_gallery for each row execute function public.set_updated_at();


-- ============================================================================
-- Row-Level Security
--   • settings, audit_logs : server-only (no client policies).
--   • homepage_banners     : public read of ACTIVE slots (rendered on the homepage).
--   • instagram_gallery    : public read (curated, public content).
-- ============================================================================
alter table public.settings          enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.homepage_banners  enable row level security;
alter table public.instagram_gallery enable row level security;

create policy "homepage_banners public read active"
  on public.homepage_banners for select to anon, authenticated
  using (is_active);

create policy "instagram_gallery public read"
  on public.instagram_gallery for select to anon, authenticated
  using (true);


-- ============================================================================
-- Grants (inline)
-- ============================================================================
-- Server/admin only:
grant all on public.settings   to service_role;
grant all on public.audit_logs to service_role;

-- Public editorial content (read), full server access:
grant select on public.homepage_banners  to anon, authenticated;
grant all    on public.homepage_banners  to service_role;
grant select on public.instagram_gallery to anon, authenticated;
grant all    on public.instagram_gallery to service_role;
