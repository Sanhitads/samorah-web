-- CMS Slice 2 — Media Library. The single source of truth for every visual asset.
--
-- This is the DB persistence for the platform's already-designed Asset model
-- (src/platform/asset.ts): rows here feed `registerAssets()` so `resolveAsset(ref)`
-- finds them (Registry → Alias → Gradient → URL), and `getAssetUsage()` answers
-- "who references this?" from the relationship graph. Storage backend is Cloudinary
-- (configured; res.cloudinary.com already whitelisted) — but the row is provider-
-- agnostic (provider + public_id + url), so a backend swap never touches consumers.
--
-- THE RULE (see docs/CMS_ARCHITECTURE.md): every asset is ONE row here, referenced
-- by media id everywhere. No other table stores an image URL.

create table if not exists public.media (
  id             uuid primary key default gen_random_uuid(),
  kind           varchar(20)  not null default 'image' check (kind in ('image','video','animation','audio','document')),
  provider       varchar(20)  not null default 'cloudinary' check (provider in ('cloudinary','supabase','external')),
  public_id      text,                                   -- cloudinary public_id / storage path (null for pasted external URL)
  url            text         not null,                  -- canonical original delivery URL
  width          integer,
  height         integer,
  bytes          integer,
  format         varchar(12),                            -- webp / jpg / png / mp4 …
  alt            text,                                   -- accessibility; empty = decorative
  title          text,                                   -- admin-facing label
  role           varchar(20)  default 'support',         -- hero/support/detail/portrait/lifestyle/… (ImageRole)
  focal_x        real,                                   -- 0–1 focal point (crop never loses subject)
  focal_y        real,
  dominant_color varchar(9),
  aspect_ratio   varchar(12),                            -- "4 / 5" — prevents CLS
  folder         varchar(60)  not null default 'general',
  tags           text[]       not null default '{}',
  photographer   text,
  status         varchar(20)  not null default 'published' check (status in ('draft','published','archived')),
  version        integer      not null default 1,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists media_folder_idx  on public.media (folder, created_at desc);
create index if not exists media_status_idx  on public.media (status);
create index if not exists media_tags_idx    on public.media using gin (tags);
create unique index if not exists media_public_id_uidx on public.media (provider, public_id) where public_id is not null;

alter table public.media enable row level security;
grant all on public.media to service_role;
