-- Order Management module (SLP principles 7, 8, 9) — the FINANCIAL/commercial
-- side of an order, deliberately separate from the warehouse Fulfillment Board.
--
--   • Business cancellation: role-gated (manager+), reason required, optional
--     inventory release (restock) — cancel is NOT a refund.
--   • Refund workflow: a `refunds` ledger (one row per attempt) with an over-refund
--     guard in the DB, async status (initiated→processing→processed/failed), so a
--     partial or failed refund can never corrupt the order's money summary.
--
-- All state changes here are attributed to a staff actor and mirrored into the
-- immutable `audit_events` stream by the service layer.

-- ── orders: cancellation + refund summary columns ────────────────────────────
alter table public.orders add column if not exists cancelled_at   timestamptz;
alter table public.orders add column if not exists cancel_reason  text;
alter table public.orders add column if not exists cancelled_by   uuid references public.users(id) on delete set null;
alter table public.orders add column if not exists refund_amount  numeric(12,2) not null default 0 check (refund_amount >= 0);
alter table public.orders add column if not exists refunded_at    timestamptz;

-- ── refunds: the ledger. One row per refund request against a payment ────────
create table if not exists public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  razorpay_payment_id varchar(255),                        -- payment being refunded (null for manual/COD)
  razorpay_refund_id  varchar(255) unique,                 -- from Razorpay; null until the gateway accepts it
  amount              numeric(12,2) not null check (amount >= 0),
  currency            varchar(3)  not null default 'INR',
  status              varchar(20) not null default 'initiated'
                        check (status in ('initiated','processing','processed','failed')),
  method              varchar(20) not null default 'gateway'  -- gateway | manual
                        check (method in ('gateway','manual')),
  reason              text,
  error_code          varchar(80),
  error_description   text,
  requested_by        uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists refunds_order_idx  on public.refunds (order_id, created_at);
create index if not exists refunds_status_idx on public.refunds (status);

alter table public.refunds enable row level security;
grant all on public.refunds to service_role;
-- No anon/authenticated policy: refunds are service-role only (financial data).

-- ── cancel_order(p jsonb) → cancels + (optionally) restocks, idempotent ──────
-- p: { order_id, reason, actor_id, release_inventory (bool) }
-- Returns: { ok, already_cancelled, previous_status, restocked }
create or replace function public.cancel_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o           public.orders%rowtype;
  v_prev      public.order_status;
  v_restocked integer := 0;
  r           record;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Idempotent: a second cancel is a silent no-op (never double-restocks).
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true, 'previous_status', o.status);
  end if;

  -- Terminal/in-transit states are not cancellable from here (shipped/delivered/
  -- returned/rto go through returns/RTO, not cancellation).
  if o.status in ('shipped','delivered','returned','rto') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable', 'previous_status', o.status);
  end if;

  v_prev := o.status;

  update public.orders
     set status        = 'cancelled',
         cancelled_at   = now(),
         cancel_reason  = nullif(p->>'reason',''),
         cancelled_by   = nullif(p->>'actor_id','')::uuid,
         updated_at     = now()
   where id = o.id;

  -- Optional inventory release. If the order was already paid, its reservations
  -- were consumed at finalize (real stock decremented, holds deleted) — so we
  -- restock from the line items. If still pending, any live holds are freed too.
  if coalesce((p->>'release_inventory')::boolean, false) then
    if o.payment_status <> 'pending' then
      for r in select variant_id, quantity from public.order_items
               where order_id = o.id and variant_id is not null loop
        update public.variants set stock = stock + r.quantity, updated_at = now()
         where id = r.variant_id;
        v_restocked := v_restocked + r.quantity;
      end loop;
    end if;
    delete from public.stock_reservations where order_id = o.id;
  end if;

  return jsonb_build_object('ok', true, 'already_cancelled', false,
                            'previous_status', v_prev, 'restocked', v_restocked);
end;
$$;

-- ── begin_refund(p jsonb) → reserve a refund slot with an over-refund guard ──
-- p: { order_id, amount, reason, actor_id, payment_id, method }
-- Sums existing non-failed refunds under a row lock so two concurrent refunds
-- can never exceed the amount actually paid. Returns { ok, refund_id } or reason.
create or replace function public.begin_refund(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders%rowtype;
  v_amount   numeric(12,2) := (p->>'amount')::numeric;
  v_existing numeric(12,2);
  v_id       uuid;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if o.payment_status = 'pending' or o.payment_status = 'failed' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  select coalesce(sum(amount), 0) into v_existing
    from public.refunds where order_id = o.id and status <> 'failed';

  if v_existing + v_amount > o.total_amount then
    return jsonb_build_object('ok', false, 'reason', 'over_refund',
             'already', v_existing, 'total', o.total_amount);
  end if;

  insert into public.refunds (order_id, razorpay_payment_id, amount, currency,
                              status, method, reason, requested_by)
  values (o.id, nullif(p->>'payment_id',''), v_amount, coalesce(nullif(p->>'currency',''),'INR'),
          'initiated', coalesce(nullif(p->>'method',''),'gateway'),
          nullif(p->>'reason',''), nullif(p->>'actor_id','')::uuid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'refund_id', v_id);
end;
$$;

-- ── settle_refund(p jsonb) → record outcome + roll up the order summary ──────
-- p: { refund_id, razorpay_refund_id, status, error_code, error_description }
-- status ∈ processing|processed|failed. On 'processed' the order's refund_amount
-- and payment_status (refunded / partially_refunded) are recomputed from the
-- ledger — the ledger is the source of truth, never a running client total.
create or replace function public.settle_refund(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   uuid;
  v_status  text := p->>'status';
  v_total   numeric(12,2);
  v_settled numeric(12,2);
begin
  update public.refunds
     set razorpay_refund_id = coalesce(nullif(p->>'razorpay_refund_id',''), razorpay_refund_id),
         status             = v_status,
         error_code         = nullif(p->>'error_code',''),
         error_description  = nullif(p->>'error_description',''),
         updated_at         = now()
   where id = (p->>'refund_id')::uuid
  returning order_id into v_order;

  if v_order is null then
    return jsonb_build_object('ok', false, 'reason', 'refund_not_found');
  end if;

  -- Recompute the order money summary from processed refunds only.
  select total_amount into v_total from public.orders where id = v_order;
  select coalesce(sum(amount), 0) into v_settled
    from public.refunds where order_id = v_order and status = 'processed';

  update public.orders
     set refund_amount  = v_settled,
         refunded_at    = case when v_settled > 0 then now() else refunded_at end,
         payment_status = case
                            when v_settled <= 0 then payment_status
                            when v_settled >= v_total then 'refunded'::public.payment_status
                            else 'partially_refunded'::public.payment_status
                          end,
         updated_at     = now()
   where id = v_order;

  return jsonb_build_object('ok', true, 'order_id', v_order, 'settled', v_settled);
end;
$$;

revoke all on function public.cancel_order(jsonb)   from public, anon, authenticated;
revoke all on function public.begin_refund(jsonb)   from public, anon, authenticated;
revoke all on function public.settle_refund(jsonb)  from public, anon, authenticated;
grant execute on function public.cancel_order(jsonb)  to service_role;
grant execute on function public.begin_refund(jsonb)  to service_role;
grant execute on function public.settle_refund(jsonb) to service_role;
