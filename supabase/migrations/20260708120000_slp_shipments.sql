-- SLP Slice 2 — shipment persistence + immutable tracking history. Provider-agnostic:
-- `provider` records who carried it (manual today), but the schema never assumes a
-- specific courier. One shipment per order for now (multi-box is a later slice).

create table if not exists public.shipments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  warehouse_id          varchar(40),
  provider              varchar(30) not null,                 -- 'manual' | 'shiprocket' | ...
  status                varchar(30) not null default 'pending', -- shipment state machine
  provider_shipment_id  varchar(255),
  awb                   varchar(255),
  courier_name          varchar(120),
  tracking_url          text,
  label_url             text,
  payment_mode          varchar(20) not null default 'prepaid',
  cod_amount            numeric(12,2) not null default 0,
  -- weights (kg), each stored separately — never overwritten
  net_weight_kg         numeric(10,3),
  packaging_weight_kg   numeric(10,3),
  shipping_weight_kg    numeric(10,3),
  volumetric_weight_kg  numeric(10,3),
  chargeable_weight_kg  numeric(10,3),
  -- external box dimensions (cm)
  length_cm             numeric(10,2),
  width_cm              numeric(10,2),
  height_cm             numeric(10,2),
  declared_value        numeric(12,2),
  shipping_cost         numeric(12,2),
  insured               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (order_id)                                            -- one shipment/order (idempotent); relax for multi-box later
);
create index if not exists shipments_order_idx on public.shipments (order_id);
create index if not exists shipments_status_idx on public.shipments (status);
alter table public.shipments enable row level security;

create table if not exists public.shipment_events (
  id              uuid primary key default gen_random_uuid(),
  shipment_id     uuid not null references public.shipments(id) on delete cascade,
  status          varchar(30) not null,     -- internal shipment status
  customer_status varchar(30),              -- unified customer-facing status
  description     text,
  location        varchar(160),
  source          varchar(30) not null default 'system', -- 'system' | 'provider' | 'admin'
  created_at      timestamptz not null default now()
);
create index if not exists shipment_events_shipment_idx on public.shipment_events (shipment_id, created_at);
alter table public.shipment_events enable row level security;

-- Service role (server routes) needs table access; also fix the earlier tables that
-- were created without an explicit grant.
grant all on public.shipments        to service_role;
grant all on public.shipment_events  to service_role;
grant all on public.fulfillment_jobs to service_role;
grant all on public.payment_attempts to service_role;

-- ── create_shipment — idempotent create + first event; advances the order ──────
create or replace function public.create_shipment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_existing uuid;
  v_num      text;
begin
  select id into v_existing from public.shipments where order_id = (p->>'order_id')::uuid limit 1;
  select order_number into v_num from public.orders where id = (p->>'order_id')::uuid;

  if v_existing is not null then
    return jsonb_build_object('shipment_id', v_existing, 'created', false, 'order_number', v_num);
  end if;

  insert into public.shipments (
    order_id, warehouse_id, provider, status,
    provider_shipment_id, awb, courier_name, tracking_url, label_url,
    payment_mode, cod_amount,
    shipping_weight_kg, volumetric_weight_kg, chargeable_weight_kg,
    length_cm, width_cm, height_cm,
    declared_value, shipping_cost
  ) values (
    (p->>'order_id')::uuid, nullif(p->>'warehouse_id',''), p->>'provider', p->>'status',
    nullif(p->>'provider_shipment_id',''), nullif(p->>'awb',''), nullif(p->>'courier_name',''),
    nullif(p->>'tracking_url',''), nullif(p->>'label_url',''),
    coalesce(nullif(p->>'payment_mode',''),'prepaid'), coalesce((p->>'cod_amount')::numeric, 0),
    (p->>'shipping_weight_kg')::numeric, (p->>'volumetric_weight_kg')::numeric, (p->>'chargeable_weight_kg')::numeric,
    (p->>'length_cm')::numeric, (p->>'width_cm')::numeric, (p->>'height_cm')::numeric,
    (p->>'declared_value')::numeric, (p->>'shipping_cost')::numeric
  ) returning id into v_id;

  insert into public.shipment_events (shipment_id, status, customer_status, description, source)
  values (v_id, p->>'status', nullif(p->>'customer_status',''), nullif(p->>'description',''), 'system');

  -- Advance the order: a created shipment means it's packed (dispatch on pickup).
  update public.orders set status = 'packed', updated_at = now()
    where id = (p->>'order_id')::uuid and status in ('confirmed', 'processing');

  return jsonb_build_object('shipment_id', v_id, 'created', true, 'order_number', v_num);
end;
$$;

-- ── add_shipment_event — append to the immutable timeline + update status ──────
create or replace function public.add_shipment_event(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shipment_events (shipment_id, status, customer_status, description, location, source)
  values (
    (p->>'shipment_id')::uuid, p->>'status', nullif(p->>'customer_status',''),
    nullif(p->>'description',''), nullif(p->>'location',''),
    coalesce(nullif(p->>'source',''), 'system')
  );
  update public.shipments set status = p->>'status', updated_at = now() where id = (p->>'shipment_id')::uuid;
end;
$$;

revoke all on function public.create_shipment(jsonb)    from public, anon, authenticated;
grant  execute on function public.create_shipment(jsonb) to service_role;
revoke all on function public.add_shipment_event(jsonb)  from public, anon, authenticated;
grant  execute on function public.add_shipment_event(jsonb) to service_role;
