-- ============================================================================
-- Phase 2A — Core schema (catalog + identity foundation)
--
-- Tables (in FK-dependency order):
--   categories -> collections -> products -> variants
--   users (-> auth.users) -> addresses
--   product_images, fragrance_notes (-> products)
--
-- Every later group (2B commerce, 2C inventory, 2D marketing, 2E admin) builds
-- on these. UUID PKs, auto-managed updated_at, GST fields on products, and RLS
-- enabled on every table.
-- ============================================================================


-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.user_role      as enum ('customer', 'editor', 'manager', 'admin', 'super_admin');
create type public.loyalty_tier   as enum ('bronze', 'silver', 'gold', 'platinum');
create type public.product_status as enum ('active', 'draft', 'archived', 'out_of_stock');
create type public.vessel_type    as enum ('glass', 'ceramic', 'terracotta');
create type public.fragrance_layer as enum ('top', 'heart', 'base');


-- ── updated_at trigger helper ─────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ── categories ────────────────────────────────────────────────────────────────
-- Product types with their GST defaults (BRD §9.1): Candles SAM-CAN/3406/12%,
-- Room Sprays SAM-RSP/3307/18%, etc.
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(120) not null,
  slug             varchar(140) not null unique,
  description      text,
  sku_prefix       varchar(10)  not null,                          -- e.g. SAM-CAN
  default_hsn_code varchar(10)  not null,                          -- e.g. 3406
  default_gst_rate integer      not null default 12 check (default_gst_rate in (0,5,12,18,28)),
  sort_order       integer      not null default 0,
  is_active        boolean      not null default true,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);


-- ── collections (editorial "Chapters" / Volumes) ──────────────────────────────
-- hero_product_id FK is added after products exists (circular dependency).
create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(140) not null,                           -- "Dessert Chapter"
  slug            varchar(160) not null unique,                    -- "dessert-chapter"
  volume          varchar(40),                                     -- "Vol. I"
  tagline         varchar(240),
  poetic_line     text,
  description     text,
  cover_image_url text,                                            -- Cloudinary (gradient fallback in UI)
  hero_product_id uuid,                                            -- FK added below
  is_coming_soon  boolean      not null default false,
  is_active       boolean      not null default true,
  sort_order      integer      not null default 0,
  seo_title       varchar(70),
  seo_description varchar(160),
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);


-- ── products ──────────────────────────────────────────────────────────────────
-- Variants carry the authoritative price/stock; products.price is the display MRP.
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(160) not null,
  slug             varchar(180) not null unique,
  base_sku         varchar(40)  not null unique,                   -- e.g. SAM-CAN-001 (BRD §9.2)
  category_id      uuid not null references public.categories(id)  on delete restrict,
  collection_id    uuid          references public.collections(id) on delete set null,

  -- editorial / brand content (maps to prototype src/data/products.json)
  tagline          varchar(240),
  scent_group      varchar(120),                                   -- "Warm Spiced Gourmand"
  fragrance_family varchar(60),                                    -- filter: Floral/Woody/Fresh/Dessert-Gourmand/Spicy/Oriental
  mood_tags        text[]       not null default '{}',             -- Calm/Warm/Festive/...
  story            text,
  story_long       text,
  flame_persona    varchar(160),
  cultural_reference text,
  lifestyle_use    text,
  burn_time        varchar(60),
  wax_blend        varchar(120),
  wick             varchar(120),

  -- pricing (GST-inclusive MRP)
  price            numeric(10,2) not null check (price >= 0),
  sale_price       numeric(10,2)          check (sale_price is null or sale_price >= 0),

  -- GST (BRD §8.3) — required for the tax invoice
  hsn_code         varchar(10)  not null,
  gst_rate         integer      not null default 12 check (gst_rate in (0,5,12,18,28)),

  -- fulfilment / merchandising
  weight_grams     integer      check (weight_grams is null or weight_grams >= 0),
  status           public.product_status not null default 'draft',
  is_featured      boolean      not null default false,            -- homepage featured
  is_hero          boolean      not null default false,            -- collection hero candle
  allow_backorder  boolean      not null default false,            -- BRD §10.1
  publish_at       timestamptz,                                    -- scheduled publish (USD M1)

  -- SEO
  seo_title        varchar(70),
  seo_description  varchar(160),

  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);


-- ── variants (one row per size × vessel SKU) ──────────────────────────────────
create table public.variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  sku                 varchar(60) not null unique,                 -- SAM-CAN-001-180G-CE
  variant_name        varchar(120),                                -- "180g Ceramic"
  vessel_type         public.vessel_type,
  size_label          varchar(40),                                 -- "180g"
  price               numeric(10,2) not null check (price >= 0),   -- authoritative, GST-inclusive
  sale_price          numeric(10,2)          check (sale_price is null or sale_price >= 0),
  stock               integer not null default 0  check (stock >= 0),  -- oversell guard depends on this
  low_stock_threshold integer not null default 5  check (low_stock_threshold >= 0),
  barcode             varchar(100),
  weight_grams        integer check (weight_grams is null or weight_grams >= 0),
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ── users (profile mirror of auth.users) ──────────────────────────────────────
create table public.users (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             varchar(255) not null,
  full_name         varchar(160),
  phone             varchar(20),
  role              public.user_role  not null default 'customer',
  loyalty_points    integer           not null default 0 check (loyalty_points >= 0),
  loyalty_tier      public.loyalty_tier not null default 'bronze',
  referral_code     varchar(20) unique,                            -- populated when referral ships (post-launch)
  birthday          date,
  marketing_consent boolean           not null default false,      -- DPDP consent
  created_at        timestamptz       not null default now(),
  updated_at        timestamptz       not null default now()
);

-- Bridge: create a profile row when an auth user signs up (Phase 3 builds the UI).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── addresses ─────────────────────────────────────────────────────────────────
create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  full_name  varchar(160) not null,
  phone      varchar(20)  not null,
  line1      varchar(240) not null,
  line2      varchar(240),
  city       varchar(120) not null,
  state      varchar(120) not null,                                -- drives CGST/SGST vs IGST (BRD §24.5)
  pincode    varchar(10)  not null,
  country    varchar(80)  not null default 'India',
  is_default boolean      not null default false,
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);

-- At most one default address per user.
create unique index addresses_one_default_per_user
  on public.addresses(user_id) where is_default;


-- ── product_images (Cloudinary) ───────────────────────────────────────────────
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,                                        -- Cloudinary URL
  alt_text   varchar(240) not null,                                -- required (BRD §11.3 / SEO)
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  width      integer,
  height     integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one primary image per product.
create unique index product_images_one_primary_per_product
  on public.product_images(product_id) where is_primary;


-- ── fragrance_notes (top / heart / base) ──────────────────────────────────────
create table public.fragrance_notes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  layer      public.fragrance_layer not null,
  note       varchar(120) not null,                                -- "Bergamot"
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, layer, note)
);


-- ── deferred FK: collections.hero_product_id → products ───────────────────────
alter table public.collections
  add constraint collections_hero_product_id_fkey
  foreign key (hero_product_id) references public.products(id) on delete set null;


-- ── indexes ───────────────────────────────────────────────────────────────────
create index products_category_id_idx       on public.products(category_id);
create index products_collection_id_idx     on public.products(collection_id);
create index products_status_idx            on public.products(status);
create index products_fragrance_family_idx  on public.products(fragrance_family);
create index products_is_featured_idx       on public.products(is_featured) where is_featured;
create index products_mood_tags_gin         on public.products using gin (mood_tags);
create index variants_product_id_idx        on public.variants(product_id);
create index variants_is_active_idx         on public.variants(is_active);
create index addresses_user_id_idx          on public.addresses(user_id);
create index product_images_product_id_idx  on public.product_images(product_id);
create index fragrance_notes_product_id_idx on public.fragrance_notes(product_id);


-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_categories_updated_at      before update on public.categories      for each row execute function public.set_updated_at();
create trigger trg_collections_updated_at     before update on public.collections     for each row execute function public.set_updated_at();
create trigger trg_products_updated_at        before update on public.products        for each row execute function public.set_updated_at();
create trigger trg_variants_updated_at        before update on public.variants        for each row execute function public.set_updated_at();
create trigger trg_users_updated_at           before update on public.users           for each row execute function public.set_updated_at();
create trigger trg_addresses_updated_at       before update on public.addresses       for each row execute function public.set_updated_at();
create trigger trg_product_images_updated_at  before update on public.product_images  for each row execute function public.set_updated_at();


-- ============================================================================
-- Row-Level Security
--   • Catalog tables: public READ of live/active rows only. No public write
--     policies, so writes are denied for anon/authenticated; admin/staff writes
--     use the service role (bypasses RLS) until staff policies land in Phase 3/15.
--   • users / addresses: each signed-in user reads & writes only their own rows.
--   • users UPDATE is narrowed to non-privileged columns so customers cannot
--     escalate their own role / loyalty balance via the data API.
-- ============================================================================

alter table public.categories      enable row level security;
alter table public.collections     enable row level security;
alter table public.products        enable row level security;
alter table public.variants        enable row level security;
alter table public.users           enable row level security;
alter table public.addresses       enable row level security;
alter table public.product_images  enable row level security;
alter table public.fragrance_notes enable row level security;

-- Catalog: public read of active rows
create policy "categories public read"
  on public.categories for select to anon, authenticated
  using (is_active);

create policy "collections public read"
  on public.collections for select to anon, authenticated
  using (is_active);

create policy "products public read"
  on public.products for select to anon, authenticated
  using (status = 'active');

create policy "variants public read"
  on public.variants for select to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );

create policy "product_images public read"
  on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

create policy "fragrance_notes public read"
  on public.fragrance_notes for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

-- users: read & update own profile
create policy "users read own"
  on public.users for select to authenticated
  using (auth.uid() = id);

create policy "users update own"
  on public.users for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent privilege/loyalty escalation: customers may only edit these columns.
revoke update on public.users from anon, authenticated;
grant  update (full_name, phone, birthday, marketing_consent) on public.users to authenticated;

-- addresses: full CRUD of own rows
create policy "addresses select own"
  on public.addresses for select to authenticated
  using (auth.uid() = user_id);

create policy "addresses insert own"
  on public.addresses for insert to authenticated
  with check (auth.uid() = user_id);

create policy "addresses update own"
  on public.addresses for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "addresses delete own"
  on public.addresses for delete to authenticated
  using (auth.uid() = user_id);
