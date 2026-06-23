-- ============================================================================
-- Phase 2E-2 — Commerce-support & automation
--
-- Tables:  cart, stock_notifications, search_logs, related_products, notifications
--
-- The server "cart" row is a snapshot for the abandoned-cart sweep (the live cart
-- is client-side Zustand+localStorage). It is modelled as ONE row per user/guest
-- session with an items[] payload + the three abandoned-email flags (USD M5),
-- not per line-item, so the pg_cron query matches USD M5 directly.
-- ============================================================================


-- ── cart (server snapshot for the abandoned-cart sweep) ────────────────────────
create table public.cart (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references public.users(id) on delete cascade,
  session_id             varchar(255),                       -- guest
  email                  varchar(255),                       -- captured for guest abandoned-cart emails
  items                  jsonb not null default '[]',        -- [{product_id, variant_id, sku, name, price, quantity}]
  subtotal               numeric(12,2) not null default 0,
  last_activity_at       timestamptz not null default now(),
  abandoned_email_1_sent boolean not null default false,
  abandoned_email_2_sent boolean not null default false,
  abandoned_email_3_sent boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint cart_owner_present check (user_id is not null or session_id is not null)
);

-- one cart per user, one per guest session
create unique index cart_user_id_key    on public.cart(user_id)    where user_id is not null;
create unique index cart_session_id_key  on public.cart(session_id) where session_id is not null;
create index cart_last_activity_idx on public.cart(last_activity_at);
create index cart_email_idx         on public.cart(email);

create trigger trg_cart_updated_at before update on public.cart for each row execute function public.set_updated_at();


-- ── stock_notifications (back-in-stock "notify me", USD C15/C20/M9) ────────────
create table public.stock_notifications (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.variants(id) on delete cascade,
  email       varchar(255) not null,
  user_id     uuid references public.users(id) on delete set null,
  is_notified boolean not null default false,
  notified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (variant_id, email)
);

create index stock_notifications_variant_pending_idx
  on public.stock_notifications(variant_id) where not is_notified;


-- ── search_logs (zero-result analytics, USD M12) ───────────────────────────────
create table public.search_logs (
  id                 uuid primary key default gen_random_uuid(),
  query              varchar(255) not null,
  results_count      integer not null default 0,
  clicked_product_id uuid references public.products(id) on delete set null,
  user_id            uuid references public.users(id) on delete set null,
  session_id         varchar(255),
  created_at         timestamptz not null default now()
);

create index search_logs_query_idx        on public.search_logs(query);
create index search_logs_zero_result_idx   on public.search_logs(created_at) where results_count = 0;


-- ── related_products (editorial recommendation overrides, USD S8) ──────────────
create table public.related_products (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  related_product_id uuid not null references public.products(id) on delete cascade,
  relation_type      varchar(40) not null default 'manual',   -- same_family | same_mood | manual
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  unique (product_id, related_product_id),
  constraint related_products_not_self check (product_id <> related_product_id)
);

create index related_products_product_id_idx on public.related_products(product_id);


-- ── notifications (in-account notification center, USD Appendix A) ─────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  title      varchar(160) not null,
  body       text,
  type       varchar(40),                                     -- order | loyalty | promo | system
  action_url text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications(user_id, is_read);


-- ============================================================================
-- Row-Level Security
--   • cart           : owner reads own (sync/writes happen server-side).
--   • stock_notifs   : anyone may subscribe; not publicly readable.
--   • search_logs    : server-only.
--   • related_products: public read (shown on product page).
--   • notifications  : owner reads own + marks read (is_read only).
-- ============================================================================
alter table public.cart                enable row level security;
alter table public.stock_notifications enable row level security;
alter table public.search_logs         enable row level security;
alter table public.related_products    enable row level security;
alter table public.notifications       enable row level security;

create policy "cart read own"
  on public.cart for select to authenticated
  using (auth.uid() = user_id);

create policy "stock_notifications subscribe"
  on public.stock_notifications for insert to anon, authenticated
  with check (true);

create policy "related_products public read"
  on public.related_products for select to anon, authenticated
  using (true);

create policy "notifications read own"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "notifications mark read own"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================================
-- Grants (inline)
-- ============================================================================
-- cart: owner read; writes server-side.
grant select on public.cart to authenticated;
grant all    on public.cart to service_role;

-- stock_notifications: subscribe only.
grant insert on public.stock_notifications to anon, authenticated;
grant all    on public.stock_notifications to service_role;

-- search_logs: server-only.
grant all on public.search_logs to service_role;

-- related_products: public read.
grant select on public.related_products to anon, authenticated;
grant all    on public.related_products to service_role;

-- notifications: owner read + mark-read (is_read column only).
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant all on public.notifications to service_role;
