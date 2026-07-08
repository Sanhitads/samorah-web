-- SLP Slice 3 — Packaging Engine (STRUCTURE ONLY). Schema + rules model; real
-- measurements (box weights/dims, per-variant net weights) are entered later as
-- DATA, not code. Four separate concerns: assets (inventory), profiles
-- (compositions), rules (Samorah business logic), and — in code — the calculator.

-- Every physical packing item is inventory: boxes, rigid/gift boxes, mailers,
-- pouches, tissue, foam, filler, wrap, leak-seal bags, tape…
create table if not exists public.packaging_assets (
  id           uuid primary key default gen_random_uuid(),
  name         varchar(120) not null,
  type         varchar(30)  not null,            -- outer_box | rigid_box | mailer | pouch | gift_box | insert | tissue | foam | filler | wrap | tape | leak_seal
  length_cm    numeric(10,2),                    -- outer dims (boxes)
  width_cm     numeric(10,2),
  height_cm    numeric(10,2),
  weight_g     numeric(10,2) not null default 0, -- the asset's own weight
  max_weight_g numeric(10,2),                    -- max content weight (boxes)
  max_products integer,                          -- max products it fits
  fragile      boolean not null default false,
  cost         numeric(10,2),                    -- unit cost
  vendor       varchar(120),
  barcode      varchar(100),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A profile is a named composition of assets (a box + inserts + wrap…).
create table if not exists public.packaging_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(120) not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.packaging_profile_items (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.packaging_profiles(id) on delete cascade,
  asset_id   uuid not null references public.packaging_assets(id) on delete restrict,
  quantity   integer not null default 1 check (quantity > 0),
  role       varchar(20) not null default 'box'  -- box | insert | filler | wrap | seal
);

-- Rules are Samorah's business logic, NOT a courier's. Two kinds:
--   select   → chooses the profile (first match by priority)
--   modifier → adds handling (fragile wrap, leak seal) — all matches apply
create table if not exists public.packaging_rules (
  id                uuid primary key default gen_random_uuid(),
  name              varchar(140) not null,
  kind              varchar(12) not null default 'select', -- 'select' | 'modifier'
  priority          integer not null default 100,
  -- conditions (null = any)
  min_products      integer,
  max_products      integer,
  product_type      varchar(30),
  vessel            varchar(30),
  is_gift           boolean,
  -- actions
  profile_id        uuid references public.packaging_profiles(id) on delete set null, -- select
  add_fragile_wrap  boolean not null default false,                                    -- modifier
  add_leak_seal     boolean not null default false,                                    -- modifier
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.packaging_assets        enable row level security;
alter table public.packaging_profiles      enable row level security;
alter table public.packaging_profile_items enable row level security;
alter table public.packaging_rules         enable row level security;

grant all on public.packaging_assets        to service_role;
grant all on public.packaging_profiles      to service_role;
grant all on public.packaging_profile_items to service_role;
grant all on public.packaging_rules         to service_role;
