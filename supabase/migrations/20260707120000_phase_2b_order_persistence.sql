-- Phase 2B — Order persistence (Razorpay). The server is the ONLY writer of orders.
-- A pending order is created at create-order time (server-priced); payment success
-- (via /verify OR the webhook) finalizes it through ONE idempotent function.
--
-- Money is stored GST-inclusive in rupees (numeric 12,2). The commerce engine works
-- in integer paise; the API layer converts once, on the way in.

-- ── Immutable snapshot + version columns (hardening) ──────────────────────────
-- Orders and their items must be self-describing: a rename, re-price, or config
-- change later must never alter a historical order/invoice.
alter table public.orders
  add column if not exists brand_name            varchar(80),
  add column if not exists commerce_version      varchar(20),
  add column if not exists tax_version           varchar(30),
  add column if not exists pricing_version       varchar(30),
  add column if not exists shipping_method       varchar(40),
  add column if not exists shipping_charge        numeric(12,2) not null default 0,
  add column if not exists shipping_gst           numeric(12,2) not null default 0,
  add column if not exists shipping_rate_version  varchar(30),
  add column if not exists cart_hash             varchar(80),
  -- marketing attribution (last-touch captured at landing)
  add column if not exists utm_source            varchar(120),
  add column if not exists utm_medium            varchar(120),
  add column if not exists utm_campaign          varchar(160),
  add column if not exists utm_content           varchar(160),
  add column if not exists utm_term              varchar(160);

alter table public.order_items
  add column if not exists brand_name       varchar(80),
  add column if not exists collection_name  varchar(140),
  add column if not exists volume_label     varchar(40),
  add column if not exists edition_label    varchar(40),
  add column if not exists vessel           varchar(60),
  add column if not exists size             varchar(60),
  add column if not exists product_slug     varchar(200),
  add column if not exists image_url        text;

-- Webhook audit fields — verified flag + processing time. NEVER store secrets or
-- HMAC values (we persist only the JSON body, never the signature header).
alter table public.webhook_logs
  add column if not exists verified      boolean not null default false,
  add column if not exists processing_ms integer;

-- ── payment_attempts — full retry history (never overwrite a prior attempt) ────
create table if not exists public.payment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id) on delete set null,
  razorpay_order_id   varchar(255),
  razorpay_payment_id varchar(255) unique,                 -- dedup replays
  status              varchar(20) not null,                -- 'attempted' | 'failed' | 'cancelled' | 'paid'
  amount              numeric(12,2),
  currency            varchar(10),
  error_code          varchar(80),
  error_description   text,
  source              varchar(20),                         -- 'verify' | 'webhook'
  created_at          timestamptz not null default now()
);
create index if not exists payment_attempts_order_idx on public.payment_attempts (order_id);
create index if not exists payment_attempts_rzp_order_idx on public.payment_attempts (razorpay_order_id);
alter table public.payment_attempts enable row level security;

-- ── fulfillment_jobs — decouple external side-effects from the webhook ─────────
-- Email + Shiprocket are QUEUED here after commit and processed by a worker, so a
-- slow/failed external service never blocks or rolls back a paid order.
create table if not exists public.fulfillment_jobs (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  job_type   varchar(30) not null,                       -- 'email' | 'shiprocket'
  status     varchar(20) not null default 'queued',      -- queued | processing | done | failed
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, job_type)                             -- idempotent enqueue
);
create index if not exists fulfillment_jobs_status_idx on public.fulfillment_jobs (status);
alter table public.fulfillment_jobs enable row level security;

-- ── Atomic counter allocation (order & invoice sequences) ─────────────────────
-- Upsert-increment: the first caller for a (scope, period) inserts 1, everyone
-- after increments. Row-level, so concurrent callers serialise and never collide.
create or replace function public.next_counter(p_scope text, p_period text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.counters (scope, period, last_number)
  values (p_scope, p_period, 1)
  on conflict (scope, period)
  do update set last_number = public.counters.last_number + 1
  returning last_number;
$$;

-- India financial year label for a timestamp → "26-27" (FY starts 1 April).
create or replace function public.financial_year(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select case
    when extract(month from p_ts) >= 4
      then to_char(p_ts, 'YY') || '-' || to_char(p_ts + interval '1 year', 'YY')
      else to_char(p_ts - interval '1 year', 'YY') || '-' || to_char(p_ts, 'YY')
  end;
$$;

-- ── create_pending_order — server-priced snapshot, status pending ─────────────
-- Allocates the order number (per calendar year) and writes the order + items.
-- Invoice number is NOT allocated here — only on payment success (legal gapless-ness).
create or replace function public.create_pending_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   text := to_char(now(), 'YYYY');
  v_seq    integer;
  v_number text;
  v_id     uuid;
  v_item   jsonb;
begin
  v_seq := public.next_counter('order', v_year);
  v_number := 'SAM-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  insert into public.orders (
    order_number, email, phone,
    status, payment_status, payment_method,
    coupon_code,
    subtotal, discount_amount, shipping_amount, total_amount,
    taxable_amount, cgst_amount, sgst_amount, igst_amount,
    ship_full_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode,
    internal_notes,
    razorpay_order_id,
    brand_name, commerce_version, tax_version, pricing_version,
    shipping_method, shipping_charge, shipping_gst, shipping_rate_version,
    cart_hash,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    placed_at
  ) values (
    v_number, p->>'email', p->>'phone',
    'pending', 'pending', 'razorpay',
    nullif(p->>'coupon_code', ''),
    (p->>'subtotal')::numeric, (p->>'discount_amount')::numeric, (p->>'shipping_amount')::numeric, (p->>'total_amount')::numeric,
    (p->>'taxable_amount')::numeric, (p->>'cgst_amount')::numeric, (p->>'sgst_amount')::numeric, (p->>'igst_amount')::numeric,
    p->>'ship_full_name', p->>'ship_phone', p->>'ship_line1', nullif(p->>'ship_line2',''), p->>'ship_city', p->>'ship_state', p->>'ship_pincode',
    nullif(p->>'internal_notes',''),
    p->>'razorpay_order_id',
    nullif(p->>'brand_name',''), nullif(p->>'commerce_version',''), nullif(p->>'tax_version',''), nullif(p->>'pricing_version',''),
    nullif(p->>'shipping_method',''), (p->>'shipping_charge')::numeric, (p->>'shipping_gst')::numeric, nullif(p->>'shipping_rate_version',''),
    nullif(p->>'cart_hash',''),
    nullif(p->>'utm_source',''), nullif(p->>'utm_medium',''), nullif(p->>'utm_campaign',''), nullif(p->>'utm_content',''), nullif(p->>'utm_term',''),
    now()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, variant_name, sku, hsn_code, gst_rate,
      unit_price, quantity,
      line_subtotal, line_discount, line_taxable, line_cgst, line_sgst, line_igst, line_total,
      brand_name, collection_name, volume_label, edition_label, vessel, size, product_slug, image_url
    ) values (
      v_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'variant_id','')::uuid,
      v_item->>'product_name', nullif(v_item->>'variant_name',''), v_item->>'sku', v_item->>'hsn_code', (v_item->>'gst_rate')::integer,
      (v_item->>'unit_price')::numeric, (v_item->>'quantity')::integer,
      (v_item->>'line_subtotal')::numeric, (v_item->>'line_discount')::numeric, (v_item->>'line_taxable')::numeric,
      (v_item->>'line_cgst')::numeric, (v_item->>'line_sgst')::numeric, (v_item->>'line_igst')::numeric, (v_item->>'line_total')::numeric,
      nullif(v_item->>'brand_name',''), nullif(v_item->>'collection_name',''), nullif(v_item->>'volume_label',''),
      nullif(v_item->>'edition_label',''), nullif(v_item->>'vessel',''), nullif(v_item->>'size',''),
      nullif(v_item->>'product_slug',''), nullif(v_item->>'image_url','')
    );
  end loop;

  -- Link the stock holds made at reserve time to this order (consumed on finalize).
  if nullif(p->>'reservation_session', '') is not null then
    update public.stock_reservations
      set order_id = v_id
      where session_id = p->>'reservation_session' and order_id is null;
  end if;

  return jsonb_build_object('order_id', v_id, 'order_number', v_number);
end;
$$;

-- ── finalize_order — the ONE idempotent finalizer (persistOrder) ──────────────
-- Called by BOTH /verify and the webhook. First caller finalizes + allocates the
-- FY invoice number; any later caller sees idempotency_key set and returns the
-- existing order without side effects. Row lock serialises the race.
create or replace function public.finalize_order(
  p_razorpay_order_id text,
  p_payment_id        text,
  p_signature         text,
  p_source            text,
  p_amount_paise      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders%rowtype;
  v_fy       text;
  v_seq      integer;
  v_invoice  text;
  r          record;
begin
  select * into o from public.orders
    where razorpay_order_id = p_razorpay_order_id
    for update;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- Already finalized → idempotent no-op (second writer exits safely).
  if o.idempotency_key is not null then
    return jsonb_build_object(
      'found', true, 'created', false,
      'order_number', o.order_number, 'invoice_number', o.invoice_number,
      'email', o.email
    );
  end if;

  -- Amount guard — the captured amount must equal the persisted order total.
  -- (Razorpay enforces this per order; this is defence-in-depth against a wrong
  --  order/payment pairing. We do NOT finalize on mismatch — flag for review.)
  if p_amount_paise is not null and round(o.total_amount * 100)::integer <> p_amount_paise then
    insert into public.audit_logs (action, entity_type, entity_id, after_data)
    values ('order_amount_mismatch', 'order', o.id,
            jsonb_build_object('expected_paise', round(o.total_amount * 100), 'got_paise', p_amount_paise, 'source', p_source));
    return jsonb_build_object('found', true, 'created', false, 'amount_mismatch', true, 'order_number', o.order_number);
  end if;

  v_fy := public.financial_year(now());
  v_seq := public.next_counter('invoice', v_fy);
  v_invoice := 'SAM/' || v_fy || '/' || lpad(v_seq::text, 6, '0');

  update public.orders set
    payment_status      = 'paid',
    status              = 'confirmed',
    razorpay_payment_id = p_payment_id,
    razorpay_signature  = p_signature,
    idempotency_key     = p_payment_id,
    invoice_number      = v_invoice,
    invoice_date        = current_date,
    updated_at          = now()
  where id = o.id;

  -- Consume the stock holds atomically (in this same txn) → decrement real stock,
  -- then remove the holds. Oversell was already prevented at reserve time; this
  -- makes the deduction permanent. Idempotency (idempotency_key) guarantees this
  -- runs exactly once, so stock is never double-decremented.
  for r in select variant_id, quantity from public.stock_reservations where order_id = o.id loop
    update public.variants set stock = stock - r.quantity, updated_at = now() where id = r.variant_id;
  end loop;
  delete from public.stock_reservations where order_id = o.id;

  -- Audit trail — originates from the persisted order (not client state).
  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('order_paid', 'order', o.id,
          jsonb_build_object('source', p_source, 'payment_id', p_payment_id, 'invoice_number', v_invoice));

  return jsonb_build_object(
    'found', true, 'created', true, 'source', p_source,
    'order_id', o.id,
    'order_number', o.order_number, 'invoice_number', v_invoice,
    'email', o.email
  );
end;
$$;

-- ── reserve_stock — atomic availability check + hold (prevents oversell) ──────
-- Two passes in ONE txn: pass 1 locks every variant row and checks
-- available = stock − Σ(active holds); pass 2 inserts the holds. The row locks are
-- held across both passes, so two concurrent checkouts for the last unit serialise:
-- the first reserves, the second sees 0 available and is refused (no payment).
create or replace function public.reserve_stock(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session text := p->>'session_id';
  v_ttl     int  := coalesce((p->>'ttl_minutes')::int, 15);
  v_expires timestamptz := now() + make_interval(mins => v_ttl);
  v_item    jsonb;
  v_vid     uuid;
  v_qty     int;
  v_stock   int;
  v_active  boolean;
  v_held    int;
begin
  -- pass 1 — lock + validate all lines
  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_vid := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    select stock, is_active into v_stock, v_active from public.variants where id = v_vid for update;
    if not found or not v_active then
      return jsonb_build_object('ok', false, 'sku', v_item->>'sku', 'reason', 'unavailable');
    end if;
    select coalesce(sum(quantity), 0) into v_held from public.stock_reservations
      where variant_id = v_vid and expires_at > now();
    if v_stock - v_held < v_qty then
      return jsonb_build_object('ok', false, 'sku', v_item->>'sku', 'reason', 'insufficient_stock');
    end if;
  end loop;

  -- pass 2 — commit the holds (locks from pass 1 still held)
  for v_item in select * from jsonb_array_elements(p->'items') loop
    insert into public.stock_reservations (variant_id, quantity, session_id, expires_at)
    values ((v_item->>'variant_id')::uuid, (v_item->>'quantity')::int, v_session, v_expires);
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── release_expired_reservations — cron: free holds that were never linked ─────
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with del as (
    delete from public.stock_reservations
      where expires_at < now() and order_id is null
      returning 1
  )
  select count(*) into n from del;
  return coalesce(n, 0);
end;
$$;

-- ── expire_stale_pending_orders — cron: cancel unpaid pending orders + free holds
create or replace function public.expire_stale_pending_orders(p_minutes int default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; n int := 0;
begin
  for v_id in
    select id from public.orders
      where payment_status = 'pending' and status = 'pending'
        and placed_at < now() - make_interval(mins => p_minutes)
      for update skip locked
  loop
    update public.orders set status = 'cancelled', payment_status = 'failed', updated_at = now() where id = v_id;
    delete from public.stock_reservations where order_id = v_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ── queue_fulfillment_job — idempotent enqueue (email / shiprocket) ───────────
create or replace function public.queue_fulfillment_job(p_order_id uuid, p_job_type text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.fulfillment_jobs (order_id, job_type)
  values (p_order_id, p_job_type)
  on conflict (order_id, job_type) do nothing;
$$;

-- ── record_payment_attempt — append-only retry history (never overwrites) ─────
create or replace function public.record_payment_attempt(p jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.payment_attempts (
    order_id, razorpay_order_id, razorpay_payment_id, status, amount, currency, error_code, error_description, source
  ) values (
    nullif(p->>'order_id','')::uuid, nullif(p->>'razorpay_order_id',''), nullif(p->>'razorpay_payment_id',''),
    p->>'status', nullif(p->>'amount','')::numeric, nullif(p->>'currency',''),
    nullif(p->>'error_code',''), nullif(p->>'error_description',''), nullif(p->>'source','')
  )
  on conflict (razorpay_payment_id) do nothing;
$$;

-- Only the service role (server routes) may call these.
revoke all on function public.reserve_stock(jsonb)                              from public, anon, authenticated;
grant  execute on function public.reserve_stock(jsonb)                          to service_role;
revoke all on function public.release_expired_reservations()                    from public, anon, authenticated;
grant  execute on function public.release_expired_reservations()                to service_role;
revoke all on function public.expire_stale_pending_orders(int)                  from public, anon, authenticated;
grant  execute on function public.expire_stale_pending_orders(int)              to service_role;
revoke all on function public.queue_fulfillment_job(uuid, text)                 from public, anon, authenticated;
grant  execute on function public.queue_fulfillment_job(uuid, text)             to service_role;
revoke all on function public.record_payment_attempt(jsonb)                     from public, anon, authenticated;
grant  execute on function public.record_payment_attempt(jsonb)                 to service_role;
revoke all on function public.next_counter(text, text)                          from public, anon, authenticated;
revoke all on function public.create_pending_order(jsonb)                       from public, anon, authenticated;
revoke all on function public.finalize_order(text, text, text, text, integer)   from public, anon, authenticated;
grant execute on function public.next_counter(text, text)                        to service_role;
grant execute on function public.create_pending_order(jsonb)                     to service_role;
grant execute on function public.finalize_order(text, text, text, text, integer) to service_role;
