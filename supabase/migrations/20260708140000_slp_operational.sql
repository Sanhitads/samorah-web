-- SLP v1 operational schema — additive only. Implements the entities behind the
-- 14 gaps: warehouses, courier capabilities, shipping settings, business rules,
-- exceptions, returns, packaging inventory, and per-shipment cost breakdown.
-- Nothing existing is altered destructively.

-- ── §2 Warehouses ─────────────────────────────────────────────────────────────
create table if not exists public.warehouses (
  id            varchar(40) primary key,
  name          varchar(140) not null,
  line1         varchar(240),
  line2         varchar(240),
  city          varchar(120),
  state         varchar(120),
  pincode       varchar(10),
  country       varchar(80) default 'India',
  gstin         varchar(20),
  manager       varchar(140),
  phone         varchar(20),
  working_hours varchar(120),
  priority      integer not null default 100,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── §1 Fulfillment sub-state (finer than order status) ───────────────────────
alter table public.orders
  add column if not exists fulfillment_status varchar(30);

-- ── §3 Packaging inventory (extend assets) ────────────────────────────────────
alter table public.packaging_assets
  add column if not exists current_stock integer not null default 0,
  add column if not exists min_stock     integer not null default 0,
  add column if not exists reorder_level integer not null default 0,
  add column if not exists purchase_cost numeric(10,2);

-- ── §4 Courier capability matrix ──────────────────────────────────────────────
create table if not exists public.courier_capabilities (
  id                 uuid primary key default gen_random_uuid(),
  provider           varchar(30) not null,          -- manual | shiprocket | delhivery | ...
  courier            varchar(120) not null,
  supports_cod       boolean not null default false,
  supports_insurance boolean not null default false,
  fragile_ok         boolean not null default true,
  dangerous_goods_ok boolean not null default false,
  max_weight_kg      numeric(10,2),
  max_length_cm      numeric(10,2),
  pickup_sla_hrs     integer,
  base_cost          numeric(10,2),                 -- indicative, for cheapest strategy
  est_days           integer,                       -- indicative, for fastest strategy
  tier               varchar(20) default 'standard',-- standard | express | luxury
  zones              text[],                        -- serviceable zones/pincode-prefixes (null = all)
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ── §11 Shipping settings (singleton, admin-editable) ─────────────────────────
create table if not exists public.shipping_settings (
  id                  boolean primary key default true check (id),  -- single row
  default_provider    varchar(30)  not null default 'manual',
  courier_strategy    varchar(20)  not null default 'manual',       -- cheapest|fastest|luxury|preferred|manual
  auto_assign         boolean      not null default true,           -- create shipment automatically on payment
  auto_create_after_fulfillment boolean not null default false,     -- §14: gate shipping behind fulfillment
  insurance_threshold numeric(12,2) not null default 3000,
  cod_threshold       numeric(12,2) not null default 50000,
  default_warehouse_id varchar(40),
  fragile_policy      varchar(20)  not null default 'auto',         -- auto | always | never
  volumetric_divisor  integer      not null default 5000,
  working_days        text[]       not null default array['mon','tue','wed','thu','fri','sat'],
  holiday_calendar    date[]       not null default array[]::date[],
  updated_at          timestamptz  not null default now()
);

-- ── §12 Business Rule Engine ──────────────────────────────────────────────────
create table if not exists public.business_rules (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(160) not null,
  trigger    varchar(40) not null,       -- e.g. 'order.created' | 'shipment.pending'
  conditions jsonb not null default '{}'::jsonb,  -- {field, op, value}[]
  actions    jsonb not null default '[]'::jsonb,  -- [{type, value}]
  priority   integer not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── §7 Exceptions ─────────────────────────────────────────────────────────────
create table if not exists public.shipment_exceptions (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete cascade,
  type        varchar(30) not null,       -- delayed|lost|address_incorrect|customer_unavailable|courier_damaged|rejected|returned
  status      varchar(20) not null default 'open', -- open|investigating|resolved|escalated
  description text,
  resolution  text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ── §8 Returns (own module) ───────────────────────────────────────────────────
create table if not exists public.returns (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  order_number  varchar(30) not null,
  rma_number    varchar(30) unique,
  status        varchar(20) not null default 'requested', -- requested|approved|pickup_scheduled|received|qc|refund|closed|rejected
  reason        varchar(40),               -- damaged|wrong_item|not_as_described|changed_mind|defective
  refund_amount numeric(12,2),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create table if not exists public.return_events (
  id         uuid primary key default gen_random_uuid(),
  return_id  uuid not null references public.returns(id) on delete cascade,
  status     varchar(20) not null,
  description text,
  created_at timestamptz not null default now()
);

-- ── §9 Cost breakdown (extend shipments) ──────────────────────────────────────
alter table public.shipments
  add column if not exists courier_cost         numeric(12,2) not null default 0,
  add column if not exists packaging_cost       numeric(12,2) not null default 0,
  add column if not exists insurance_cost       numeric(12,2) not null default 0,
  add column if not exists cod_fee              numeric(12,2) not null default 0,
  add column if not exists fuel_surcharge       numeric(12,2) not null default 0,
  add column if not exists tax_cost             numeric(12,2) not null default 0,
  add column if not exists total_logistics_cost numeric(12,2) not null default 0,
  add column if not exists packaging_confirmed  boolean not null default false; -- §6

-- ── §10 Notification triggers ─────────────────────────────────────────────────
create table if not exists public.notification_triggers (
  id         uuid primary key default gen_random_uuid(),
  event      varchar(40) not null,       -- order.confirmed | order.dispatched | order.delivered | ...
  channel    varchar(20) not null,       -- email | whatsapp | sms | push
  template    varchar(60) not null,      -- ORDER_CONFIRMATION | ORDER_DISPATCHED | ...
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event, channel)
);

-- RLS + grants
alter table public.warehouses            enable row level security;
alter table public.courier_capabilities  enable row level security;
alter table public.shipping_settings      enable row level security;
alter table public.business_rules         enable row level security;
alter table public.shipment_exceptions    enable row level security;
alter table public.returns                enable row level security;
alter table public.return_events          enable row level security;
alter table public.notification_triggers  enable row level security;
grant all on public.warehouses            to service_role;
grant all on public.courier_capabilities  to service_role;
grant all on public.shipping_settings      to service_role;
grant all on public.business_rules         to service_role;
grant all on public.shipment_exceptions    to service_role;
grant all on public.returns                to service_role;
grant all on public.return_events          to service_role;
grant all on public.notification_triggers  to service_role;

-- Seed: the singleton settings row + the default warehouse + default notification
-- triggers. Business rules / courier capabilities start empty (entered later).
insert into public.shipping_settings (id, default_warehouse_id)
  values (true, 'wh_blr')
  on conflict (id) do nothing;

insert into public.warehouses (id, name, line1, line2, city, state, pincode, country, gstin, priority, active)
  values ('wh_blr', 'Samorah Studio — Bengaluru',
          '1383/433, 3rd Floor, Dex Co Work, 5th B Main Road', 'HBR Layout',
          'Bengaluru', 'Karnataka', '560045', 'India', '29BCZPD3150Q1ZS', 1, true)
  on conflict (id) do nothing;

insert into public.notification_triggers (event, channel, template) values
  ('order.confirmed', 'email', 'ORDER_CONFIRMATION'),
  ('order.dispatched', 'email', 'ORDER_DISPATCHED')
  on conflict (event, channel) do nothing;
