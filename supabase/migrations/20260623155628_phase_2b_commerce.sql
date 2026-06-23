-- ============================================================================
-- Phase 2B — Commerce schema
--
-- Tables (FK-dependency order):  coupons -> orders -> order_items
-- Plus a gapless order/invoice number generator (counters + functions).
--
-- Design notes:
--   • Orders SNAPSHOT the delivery address and GST split (ship_* / *gst_amount)
--     so later address edits/deletes never corrupt a tax invoice.
--   • order_items SNAPSHOT name/sku/hsn/gst_rate/price at purchase time, for the
--     same reason — the invoice is independent of live catalog edits.
--   • orders.idempotency_key is UNIQUE — the Razorpay webhook guard (BRD §24.2).
--   • Orders/coupons are SERVER-managed (created via the service role after
--     server-side validation). Customers can only READ their own orders/items;
--     coupons are not publicly readable (validated server-side).
-- ============================================================================


-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.coupon_type    as enum ('percent', 'fixed');
create type public.order_status    as enum (
  'pending', 'confirmed', 'processing', 'packed', 'shipped',
  'delivered', 'cancelled', 'returned', 'rto'
);
create type public.payment_status  as enum (
  'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
);
create type public.ndr_status      as enum (
  'delivery_failed', 're_attempt_scheduled', 'rto'
);


-- ── coupons ───────────────────────────────────────────────────────────────────
create table public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               varchar(40) not null unique,
  description        varchar(240),
  type               public.coupon_type not null,
  value              numeric(10,2) not null check (value >= 0),
  -- percent coupons cannot exceed 100%
  constraint coupons_percent_max check (type <> 'percent' or value <= 100),
  max_discount       numeric(10,2) check (max_discount is null or max_discount >= 0), -- cap for percent
  min_order          numeric(10,2) not null default 0 check (min_order >= 0),
  max_uses           integer check (max_uses is null or max_uses >= 0),               -- null = unlimited
  used_count         integer not null default 0 check (used_count >= 0),
  max_uses_per_user  integer default 1 check (max_uses_per_user is null or max_uses_per_user >= 0),
  user_id            uuid references public.users(id) on delete cascade,              -- user-specific
  product_id         uuid references public.products(id) on delete cascade,           -- product restriction
  first_order_only   boolean not null default false,
  auto_apply         boolean not null default false,
  starts_at          timestamptz,
  expires_at         timestamptz,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);


-- ── orders ─────────────────────────────────────────────────────────────────────
create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       varchar(30) not null unique,                                     -- SAM-2026-0001
  user_id            uuid references public.users(id) on delete set null,             -- null = guest
  email              varchar(255) not null,                                           -- guest tracking / contact
  phone              varchar(20),

  status             public.order_status   not null default 'pending',
  payment_status     public.payment_status not null default 'pending',
  payment_method     varchar(30),                                                     -- 'cod' | 'upi' | 'card' | ...
  is_cod             boolean not null default false,

  -- Razorpay webhook idempotency guard (BRD §24.2)
  idempotency_key    varchar(255) unique,                                             -- razorpay_payment_id

  -- discount references
  coupon_id          uuid references public.coupons(id) on delete set null,
  coupon_code        varchar(40),                                                     -- snapshot

  -- financial breakdown (GST-inclusive INR)
  subtotal           numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount    numeric(12,2) not null default 0 check (discount_amount >= 0),
  loyalty_discount   numeric(12,2) not null default 0 check (loyalty_discount >= 0),
  gift_card_amount   numeric(12,2) not null default 0 check (gift_card_amount >= 0),  -- (gift cards: post-launch)
  shipping_amount    numeric(12,2) not null default 0 check (shipping_amount >= 0),
  total_amount       numeric(12,2) not null default 0 check (total_amount >= 0),

  -- GST split (computed at checkout; the unused side is left 0) — BRD §24.5
  taxable_amount     numeric(12,2) not null default 0,
  cgst_amount        numeric(12,2) not null default 0,
  sgst_amount        numeric(12,2) not null default 0,
  igst_amount        numeric(12,2) not null default 0,

  -- delivery address SNAPSHOT (not a FK — invoice integrity)
  address_id         uuid references public.addresses(id) on delete set null,         -- soft link only
  ship_full_name     varchar(160),
  ship_phone         varchar(20),
  ship_line1         varchar(240),
  ship_line2         varchar(240),
  ship_city          varchar(120),
  ship_state         varchar(120),                                                    -- the state used for the GST split
  ship_pincode       varchar(10),
  ship_country       varchar(80) default 'India',

  -- gift fields (USD C22)
  is_gift            boolean not null default false,
  gift_note          text,
  gift_recipient     varchar(160),
  gift_occasion      varchar(60),

  -- Razorpay references
  razorpay_order_id   varchar(255),
  razorpay_payment_id varchar(255),
  razorpay_signature  varchar(255),

  -- Shiprocket references
  shiprocket_order_id    varchar(255),
  shiprocket_shipment_id varchar(255),
  awb_number             varchar(255),
  courier_name           varchar(120),
  tracking_url           text,

  -- NDR (BRD §13.2)
  ndr_status         public.ndr_status,
  ndr_reason         varchar(240),

  -- loyalty (post-launch feature; columns ready now)
  loyalty_points_earned integer not null default 0 check (loyalty_points_earned >= 0),
  loyalty_points_used   integer not null default 0 check (loyalty_points_used >= 0),

  -- tax invoice (number allocated on payment success, Phase 12)
  invoice_number     varchar(40) unique,                                              -- SAM/2026-27/0001
  invoice_date       date,
  invoice_url        text,

  internal_notes     text,                                                            -- admin-only (BRD §11.4)
  placed_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);


-- ── order_items (immutable snapshot line items) ─────────────────────────────────
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  variant_id    uuid references public.variants(id) on delete set null,               -- soft link
  product_id    uuid references public.products(id) on delete set null,               -- soft link

  -- snapshots at purchase time (invoice integrity)
  product_name  varchar(160) not null,
  variant_name  varchar(120),
  sku           varchar(60)  not null,
  hsn_code      varchar(10)  not null,
  gst_rate      integer      not null,
  unit_price    numeric(10,2) not null check (unit_price >= 0),                        -- GST-inclusive per unit
  quantity      integer      not null check (quantity > 0),

  -- per-line money (GST-inclusive amounts + extracted tax)
  line_subtotal numeric(12,2) not null check (line_subtotal >= 0),
  line_discount numeric(12,2) not null default 0 check (line_discount >= 0),
  line_taxable  numeric(12,2) not null default 0,
  line_cgst     numeric(12,2) not null default 0,
  line_sgst     numeric(12,2) not null default 0,
  line_igst     numeric(12,2) not null default 0,
  line_total    numeric(12,2) not null check (line_total >= 0),

  -- bundles (USD C16): a single line composed of multiple component SKUs
  is_bundle         boolean not null default false,
  bundle_components jsonb,

  created_at    timestamptz not null default now()
);


-- ── order / invoice number generators (gapless, concurrency-safe) ──────────────
-- One counter row per (scope, period). The UPSERT row-locks the counter so
-- concurrent orders never collide or skip numbers.
create table public.counters (
  scope       varchar(40) not null,             -- 'order' | 'invoice'
  period      varchar(9)  not null,             -- calendar year '2026' or FY '2026-27'
  last_number integer     not null default 0,
  primary key (scope, period)
);

-- SAM-2026-0001  (calendar year, IST)
create or replace function public.allocate_order_number()
returns text
language plpgsql
as $$
declare
  yr varchar(9);
  n  integer;
begin
  yr := to_char((now() at time zone 'Asia/Kolkata'), 'YYYY');
  insert into public.counters (scope, period, last_number)
  values ('order', yr, 1)
  on conflict (scope, period)
  do update set last_number = public.counters.last_number + 1
  returning last_number into n;
  return 'SAM-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

-- SAM/2026-27/0001  (Indian financial year Apr–Mar, IST) — allocated on payment success
create or replace function public.allocate_invoice_number()
returns text
language plpgsql
as $$
declare
  d   date := (now() at time zone 'Asia/Kolkata')::date;
  fy  varchar(9);
  y   integer := extract(year from d)::int;
  n   integer;
begin
  if extract(month from d) >= 4 then
    fy := y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  else
    fy := (y - 1)::text || '-' || lpad((y % 100)::text, 2, '0');
  end if;
  insert into public.counters (scope, period, last_number)
  values ('invoice', fy, 1)
  on conflict (scope, period)
  do update set last_number = public.counters.last_number + 1
  returning last_number into n;
  return 'SAM/' || fy || '/' || lpad(n::text, 4, '0');
end;
$$;


-- ── indexes ───────────────────────────────────────────────────────────────────
create index coupons_is_active_idx        on public.coupons(is_active);
create index coupons_user_id_idx          on public.coupons(user_id);
create index coupons_expires_at_idx       on public.coupons(expires_at);

create index orders_user_id_idx           on public.orders(user_id);
create index orders_email_idx             on public.orders(email);
create index orders_status_idx            on public.orders(status);
create index orders_payment_status_idx    on public.orders(payment_status);
create index orders_razorpay_order_id_idx on public.orders(razorpay_order_id);
create index orders_awb_number_idx        on public.orders(awb_number);
create index orders_ndr_status_idx        on public.orders(ndr_status) where ndr_status is not null;
create index orders_placed_at_idx         on public.orders(placed_at desc);

create index order_items_order_id_idx     on public.order_items(order_id);
create index order_items_variant_id_idx   on public.order_items(variant_id);


-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_coupons_updated_at before update on public.coupons for each row execute function public.set_updated_at();
create trigger trg_orders_updated_at  before update on public.orders  for each row execute function public.set_updated_at();


-- ============================================================================
-- Row-Level Security
--   • coupons:     server-only (validated via service role). No public access.
--   • orders:      customers READ their own orders. Created/updated server-side.
--   • order_items: customers READ items of their own orders.
-- ============================================================================
alter table public.coupons     enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.counters    enable row level security;  -- server-only (no policies; service role bypasses)

create policy "orders read own"
  on public.orders for select to authenticated
  using (auth.uid() = user_id);

create policy "order_items read own"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- (coupons: no anon/authenticated policy -> not publicly readable)


-- ============================================================================
-- Grants (inline, per the Phase 2 convention)
--   RLS still governs which ROWS each role can read.
-- ============================================================================

-- Customers: read-only on their own orders/items (writes happen server-side).
grant select on public.orders      to authenticated;
grant select on public.order_items to authenticated;

-- Server / admin role: full access to the commerce group + counters.
grant all on public.coupons     to service_role;
grant all on public.orders      to service_role;
grant all on public.order_items to service_role;
grant all on public.counters    to service_role;

-- Number generators are server-only (orders created / invoices issued by the server).
revoke execute on function public.allocate_order_number()   from public;
revoke execute on function public.allocate_invoice_number() from public;
grant  execute on function public.allocate_order_number()   to service_role;
grant  execute on function public.allocate_invoice_number() to service_role;
