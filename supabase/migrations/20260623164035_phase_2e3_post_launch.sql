-- ============================================================================
-- Phase 2E-3 — Post-launch / Phase-2-ready  (final group)
--
-- Tables:  gift_cards, loyalty_transactions, referral_codes, referral_uses,
--          wholesale_customers, performance_audits, blogs
--
-- These complete the canonical schema now (BRD §1.1 "Phase-2 ready schema
-- included"); their FEATURES ship post-launch. RLS + grants inline.
-- ============================================================================


-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.loyalty_txn_type as enum ('earn', 'redeem', 'expire', 'bonus');
create type public.wholesale_status as enum ('pending', 'approved', 'suspended');
create type public.blog_status      as enum ('draft', 'scheduled', 'published');


-- ── gift_cards (BRD §16) — server-only, validated like coupons ─────────────────
create table public.gift_cards (
  id                uuid primary key default gen_random_uuid(),
  code              varchar(40) not null unique,             -- SAM-GC-XXXXXXXX
  original_amount   numeric(10,2) not null check (original_amount >= 0),
  balance           numeric(10,2) not null check (balance >= 0),
  used_amount       numeric(10,2) not null default 0 check (used_amount >= 0),
  purchaser_user_id uuid references public.users(id)  on delete set null,
  order_id          uuid references public.orders(id) on delete set null,   -- the purchase order
  recipient_email   varchar(255),
  recipient_name    varchar(160),
  message           text,
  expiry_date       date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index gift_cards_purchaser_idx on public.gift_cards(purchaser_user_id);
create index gift_cards_recipient_idx on public.gift_cards(recipient_email);


-- ── loyalty_transactions (BRD §15) — owner-read ledger ─────────────────────────
create table public.loyalty_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id)  on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  type           public.loyalty_txn_type not null,
  points_change  integer not null,                          -- +earn / -redeem / -expire / +bonus
  points_balance integer not null,                          -- running balance after this txn
  reason         varchar(240),
  created_at     timestamptz not null default now()
);
create index loyalty_transactions_user_idx on public.loyalty_transactions(user_id, created_at desc);


-- ── referral_codes (BRD §15) — one per user, owner-read ────────────────────────
create table public.referral_codes (
  id                   uuid primary key default gen_random_uuid(),
  code                 varchar(20) not null unique,         -- e.g. SARA100 (= users.referral_code)
  owner_user_id        uuid not null unique references public.users(id) on delete cascade,
  referral_count       integer not null default 0,
  total_discount_given numeric(10,2) not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);


-- ── referral_uses (BRD §15) — who referred whom ────────────────────────────────
create table public.referral_uses (
  id               uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  referred_user_id uuid references public.users(id)  on delete set null,
  order_id         uuid references public.orders(id) on delete set null,
  discount_amount  numeric(10,2) not null default 0,
  created_at       timestamptz not null default now()
);
create index referral_uses_code_idx on public.referral_uses(referral_code_id);


-- ── wholesale_customers (BRD §8.5) — inquiry → admin approval ──────────────────
create table public.wholesale_customers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete set null,    -- linked once approved
  company_name      varchar(200) not null,
  contact_name      varchar(160),
  email             varchar(255) not null,
  phone             varchar(20),
  gstin             varchar(20),
  moq               integer,
  custom_price_tier varchar(40),
  status            public.wholesale_status not null default 'pending',
  notes             text,
  approved_by       uuid references public.users(id) on delete set null,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index wholesale_customers_status_idx on public.wholesale_customers(status);


-- ── performance_audits (BRD §21) — monthly metrics, server-only ────────────────
create table public.performance_audits (
  id                  uuid primary key default gen_random_uuid(),
  audit_date          date not null default current_date,
  lighthouse_score    integer,
  performance_score   integer,
  lcp_ms              integer,
  cls_score           numeric(5,3),
  fcp_ms              integer,
  broken_links_count  integer,
  missing_meta_count  integer,
  missing_alt_count   integer,
  low_stock_count     integer,
  notes               text,
  run_by              uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index performance_audits_date_idx on public.performance_audits(audit_date desc);


-- ── blogs (BRD §11.9) — public read of published ───────────────────────────────
create table public.blogs (
  id              uuid primary key default gen_random_uuid(),
  title           varchar(240) not null,
  slug            varchar(260) not null unique,
  excerpt         text,
  content         text,                                     -- MDX
  cover_image_url text,
  author_id       uuid references public.users(id) on delete set null,
  status          public.blog_status not null default 'draft',
  tags            text[] not null default '{}',
  categories      text[] not null default '{}',
  campaign_tag    varchar(60),                              -- Diwali | Christmas | Valentine | ...
  seo_title       varchar(70),
  seo_description varchar(160),
  og_image_url    text,
  published_at    timestamptz,
  scheduled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index blogs_status_idx       on public.blogs(status);
create index blogs_published_at_idx on public.blogs(published_at desc);
create index blogs_tags_gin         on public.blogs using gin (tags);


-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_gift_cards_updated_at          before update on public.gift_cards          for each row execute function public.set_updated_at();
create trigger trg_referral_codes_updated_at      before update on public.referral_codes      for each row execute function public.set_updated_at();
create trigger trg_wholesale_customers_updated_at before update on public.wholesale_customers for each row execute function public.set_updated_at();
create trigger trg_blogs_updated_at               before update on public.blogs               for each row execute function public.set_updated_at();


-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.gift_cards          enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.referral_codes      enable row level security;
alter table public.referral_uses       enable row level security;
alter table public.wholesale_customers enable row level security;
alter table public.performance_audits  enable row level security;
alter table public.blogs               enable row level security;

-- loyalty: owner reads own ledger (the loyalty dashboard).
create policy "loyalty read own"
  on public.loyalty_transactions for select to authenticated
  using (auth.uid() = user_id);

-- referral_codes: owner reads own.
create policy "referral_codes read own"
  on public.referral_codes for select to authenticated
  using (auth.uid() = owner_user_id);

-- referral_uses: the code owner reads their own referral history.
create policy "referral_uses read own"
  on public.referral_uses for select to authenticated
  using (exists (
    select 1 from public.referral_codes rc
    where rc.id = referral_code_id and rc.owner_user_id = auth.uid()
  ));

-- wholesale: anyone may submit an inquiry (status defaults 'pending').
create policy "wholesale inquiry submit"
  on public.wholesale_customers for insert to anon, authenticated
  with check (true);

-- blogs: public read of published posts.
create policy "blogs public read published"
  on public.blogs for select to anon, authenticated
  using (status = 'published');

-- (gift_cards, performance_audits: server-only — no client policies)


-- ============================================================================
-- Grants (inline)
-- ============================================================================
grant all on public.gift_cards         to service_role;
grant all on public.performance_audits to service_role;

grant select on public.loyalty_transactions to authenticated;
grant all    on public.loyalty_transactions to service_role;

grant select on public.referral_codes to authenticated;
grant all    on public.referral_codes to service_role;

grant select on public.referral_uses to authenticated;
grant all    on public.referral_uses to service_role;

-- wholesale: public may submit only these columns (status/approval stay server-managed).
grant insert (company_name, contact_name, email, phone, gstin, moq) on public.wholesale_customers to anon, authenticated;
grant all on public.wholesale_customers to service_role;

grant select on public.blogs to anon, authenticated;
grant all    on public.blogs to service_role;
