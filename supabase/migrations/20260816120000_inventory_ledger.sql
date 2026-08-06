-- ============================================================================
-- Inventory Ledger foundation (Phase 0)
--
-- Adds the canonical, immutable stock-movement ledger + a reservation-safe manual
-- adjustment RPC + a live-reserved aggregate, and wires the EXISTING system stock
-- mutations (sale / cancel-restock / return-restock) into the ledger. No storefront,
-- reservation, or availability *behaviour* changes: on-hand stays variants.stock,
-- customer Reserved stays live unexpired holds, Available stays On Hand - Reserved(live).
--
-- Invariants enforced here (closure report INV-1..INV-12):
--   INV-1  variants.stock is the sole on-hand quantity (unchanged).
--   INV-2  no mutation may leave stock < 0 (variants CHECK + apply_stock_movement guard).
--   INV-3  manual REMOVE/SET cannot drop stock below PROTECTED reserved.
--   INV-4  every stock mutation appends exactly one movement in the same txn.
--   INV-8  history lives in this ledger, never reconstructed from mutable catalog.
--   INV-9  idempotency_key makes retried system events append at most once.
--   INV-11 order-linked holds released when the order leaves the payable lifecycle.
--   INV-12 protected-reserved is an admin floor only; storefront Available untouched.
--
-- Ledger FK strategy (approved): variant_id ON DELETE SET NULL + an immutable
-- identity snapshot (variant_ref + sku/product/variant names), mirroring
-- order_items/return_items — so a later variant delete/rename never destroys or
-- obscures history, and RESTRICT never blocks the existing catalog delete flows.
-- ============================================================================


-- ── inventory_movements — immutable, append-only ledger ───────────────────────
create table public.inventory_movements (
  id                    uuid primary key default gen_random_uuid(),
  -- Live link for integrity while the variant exists; SET NULL on delete so the row
  -- survives a catalog delete (matches order_items/return_items 'soft link').
  variant_id            uuid references public.variants(id) on delete set null,
  -- Immutable identity snapshot — never nulled; keeps history intelligible after a
  -- variant is deleted or renamed (INV-8; req #6). variant_ref is the stable key.
  variant_ref           uuid         not null,
  sku_snapshot          varchar(60)  not null,
  product_name_snapshot varchar(160) not null,
  variant_name_snapshot varchar(120),
  -- Quantities. Arithmetic + non-negative integrity enforced by CHECK (req #2).
  quantity_before       integer      not null,
  quantity_delta        integer      not null,
  quantity_after        integer      not null,
  movement_type         text         not null check (movement_type in
                          ('opening_balance','manual_adjustment','sale','cancel_restock','return_restock','rto_restock')),
  reason                text,                                   -- manual-adjustment reason (enum enforced in app)
  source_type           text         not null check (source_type in ('admin','order','return','system')),
  source_id             uuid,                                   -- order_id | return_id | null
  reference             text,                                   -- e.g. 'SAM-2026-000123'
  actor_id              uuid references public.users(id) on delete set null,
  note                  text,
  metadata              jsonb,
  idempotency_key       text,                                   -- system movements: non-null + unique
  created_at            timestamptz  not null default now(),
  constraint inventory_movements_after_nonneg check (quantity_after >= 0),
  constraint inventory_movements_arithmetic   check (quantity_after = quantity_before + quantity_delta)
);

-- One movement per idempotency_key (INV-9). Partial: manual adjustments may omit a key.
create unique index inventory_movements_idem_key_idx on public.inventory_movements(idempotency_key) where idempotency_key is not null;
create index inventory_movements_variant_idx on public.inventory_movements(variant_ref, created_at desc);
create index inventory_movements_source_idx  on public.inventory_movements(source_type, source_id);
create index inventory_movements_type_idx    on public.inventory_movements(movement_type, created_at desc);

-- Append-only: service_role may SELECT + INSERT only. No UPDATE/DELETE grant to ANY role,
-- so corrections must be compensating movements (INV-8). RLS on, no client policies.
alter table public.inventory_movements enable row level security;
grant select, insert on public.inventory_movements to service_role;


-- ── apply_stock_movement — the ONE choke point: stock change + ledger, atomic ──
-- Applies a signed delta to variants.stock AND appends exactly one movement, in one
-- txn (INV-4). Locks the variant row FOR UPDATE, so it serialises with reserve_stock
-- / finalize_order / adjust_inventory (all contend on this same row). Idempotent
-- (INV-9): a repeated idempotency_key is a no-op. Enforces INV-2 (never negative).
create or replace function public.apply_stock_movement(
  p_variant_id      uuid,
  p_delta           integer,
  p_movement_type   text,
  p_source_type     text,
  p_source_id       uuid,
  p_reference       text,
  p_actor_id        uuid,
  p_reason          text,
  p_note            text,
  p_metadata        jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer; v_after integer;
  v_sku text; v_vname text; v_pname text;
begin
  -- Idempotency gate (INV-9): a repeated key is a no-op, no stock change.
  if p_idempotency_key is not null
     and exists (select 1 from public.inventory_movements where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('applied', false, 'idempotent', true);
  end if;

  -- Lock + snapshot the variant (and its product name) for the whole txn.
  select v.stock, v.sku, v.variant_name, p.name
    into v_before, v_sku, v_vname, v_pname
    from public.variants v
    join public.products p on p.id = v.product_id
   where v.id = p_variant_id
   for update of v;
  if not found then
    raise exception 'apply_stock_movement: variant % not found', p_variant_id using errcode = 'no_data_found';
  end if;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'apply_stock_movement: stock would go negative (% + %)', v_before, p_delta using errcode = 'check_violation';
  end if;

  update public.variants set stock = v_after, updated_at = now() where id = p_variant_id;

  insert into public.inventory_movements(
    variant_id, variant_ref, sku_snapshot, product_name_snapshot, variant_name_snapshot,
    quantity_before, quantity_delta, quantity_after,
    movement_type, reason, source_type, source_id, reference, actor_id, note, metadata, idempotency_key
  ) values (
    p_variant_id, p_variant_id, v_sku, v_pname, v_vname,
    v_before, p_delta, v_after,
    p_movement_type, p_reason, p_source_type, p_source_id, p_reference, p_actor_id, p_note, p_metadata, p_idempotency_key
  );

  return jsonb_build_object('applied', true, 'before', v_before, 'delta', p_delta, 'after', v_after);
end $$;
revoke all on function public.apply_stock_movement(uuid,integer,text,text,uuid,text,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant  execute on function public.apply_stock_movement(uuid,integer,text,text,uuid,text,uuid,text,text,jsonb,text) to service_role;


-- ── adjust_inventory — reservation-safe manual adjustment (admin) ─────────────
-- mode: 'add' | 'remove' | 'set'. Locks the variant, computes PROTECTED reserved
-- (live holds OR holds tied to a still-payable order — NEVER bare order_id, so an
-- orphaned hold can't freeze stock forever; INV-11), and REJECTS any result below
-- protected reserved (INV-3) or below zero (INV-2). Then applies + ledgers via the
-- single choke point. The DB CHECK is a backstop, never the sole guard.
create or replace function public.adjust_inventory(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vid  uuid    := (p->>'variant_id')::uuid;
  v_mode text    := p->>'mode';
  v_qty  integer := (p->>'qty')::integer;
  v_idem text    := nullif(p->>'idempotency_key','');
  v_before integer; v_reserved integer; v_after integer; v_delta integer;
begin
  if v_vid is null or v_mode not in ('add','remove','set') or v_qty is null or v_qty < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if v_mode <> 'set' and v_qty = 0 then
    return jsonb_build_object('ok', false, 'reason', 'zero_quantity');
  end if;

  -- Idempotency short-circuit (mirrors apply_stock_movement so the caller sees ok:true).
  if v_idem is not null and exists (select 1 from public.inventory_movements where idempotency_key = v_idem) then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  -- Lock the variant for the whole txn.
  select stock into v_before from public.variants where id = v_vid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'variant_not_found');
  end if;

  -- PROTECTED reserved — lifecycle-based (INV-11). Under this lock no new hold can be
  -- inserted (reserve_stock needs the same row lock), so the read is consistent.
  select coalesce(sum(sr.quantity), 0) into v_reserved
    from public.stock_reservations sr
   where sr.variant_id = v_vid
     and ( sr.expires_at > now()
           or exists (select 1 from public.orders o
                       where o.id = sr.order_id and o.status = 'pending' and o.payment_status = 'pending') );

  v_after := case v_mode when 'add' then v_before + v_qty
                         when 'remove' then v_before - v_qty
                         when 'set' then v_qty end;

  if v_after < 0 then
    return jsonb_build_object('ok', false, 'reason', 'negative_stock', 'on_hand', v_before);
  end if;
  if v_after < v_reserved then
    return jsonb_build_object('ok', false, 'reason', 'below_reserved',
                              'on_hand', v_before, 'reserved', v_reserved, 'attempted', v_after);
  end if;

  v_delta := v_after - v_before;

  perform public.apply_stock_movement(
    v_vid, v_delta, 'manual_adjustment', 'admin', null,
    nullif(p->>'reference',''), nullif(p->>'actor_id','')::uuid,
    p->>'reason', nullif(p->>'note',''), p->'metadata', v_idem
  );

  return jsonb_build_object('ok', true, 'on_hand', v_after, 'delta', v_delta,
                            'reserved', v_reserved, 'available', greatest(0, v_after - v_reserved));
end $$;
revoke all on function public.adjust_inventory(jsonb) from public, anon, authenticated;
grant  execute on function public.adjust_inventory(jsonb) to service_role;


-- ── variant_reserved — LIVE reserved per variant (admin display / Available) ──
-- Storefront/customer definition (unexpired holds only), matching available_stock().
-- This is the number behind Available = On Hand - Reserved(live) (INV-6/INV-12).
-- One set-returning call for a whole page of variant ids → no N+1.
create or replace function public.variant_reserved(p_variant_ids uuid[])
returns table (variant_id uuid, reserved integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.id,
         coalesce((select sum(sr.quantity)::int from public.stock_reservations sr
                    where sr.variant_id = v.id and sr.expires_at > now()), 0)
    from public.variants v
   where v.id = any(p_variant_ids);
$$;
revoke all on function public.variant_reserved(uuid[]) from public, anon, authenticated;
grant  execute on function public.variant_reserved(uuid[]) to service_role;


-- ============================================================================
-- Wire the EXISTING system stock mutations into the ledger.
-- Behaviour preserved exactly; each now records its movement atomically (INV-4)
-- and idempotently (INV-9). Holds/order_items/return_items are aggregated per
-- variant so a single (event,variant) idempotency key is always valid even when
-- one order/return references the same variant on multiple lines (e.g. a 3x-same
-- composition), and the net stock delta is identical to the previous per-row loop.
-- ============================================================================

-- ── finalize_order — decrement becomes a 'sale' movement ──────────────────────
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
  select * into o from public.orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if o.idempotency_key is not null then
    return jsonb_build_object('found', true, 'created', false,
      'order_number', o.order_number, 'invoice_number', o.invoice_number, 'email', o.email);
  end if;

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

  -- Consume the holds → decrement real stock via the ledger choke point. Oversell was
  -- prevented at reserve time; this makes the deduction permanent + audited. Aggregated
  -- per variant so a repeat variant across holds nets one 'sale' movement (INV-4/9).
  for r in select variant_id, sum(quantity)::int as quantity
             from public.stock_reservations where order_id = o.id
            group by variant_id loop
    perform public.apply_stock_movement(
      r.variant_id, -r.quantity, 'sale', 'order', o.id, o.order_number,
      null, null, null, jsonb_build_object('payment_id', p_payment_id),
      'sale:' || o.id::text || ':' || r.variant_id::text
    );
  end loop;
  delete from public.stock_reservations where order_id = o.id;

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('order_paid', 'order', o.id,
          jsonb_build_object('source', p_source, 'payment_id', p_payment_id, 'invoice_number', v_invoice));

  return jsonb_build_object('found', true, 'created', true, 'source', p_source,
    'order_id', o.id, 'order_number', o.order_number, 'invoice_number', v_invoice, 'email', o.email);
end $$;
revoke all on function public.finalize_order(text, text, text, text, integer) from public, anon, authenticated;
grant  execute on function public.finalize_order(text, text, text, text, integer) to service_role;

-- ── cancel_order — unconditional hold cleanup (INV-11) + ledgered restock ──────
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
  v_res       jsonb;
  r           record;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true, 'previous_status', o.status);
  end if;
  if o.status in ('shipped','delivered','returned','rto') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable', 'previous_status', o.status);
  end if;

  v_prev := o.status;

  update public.orders
     set status            = 'cancelled',
         cancelled_at       = now(),
         cancel_reason      = nullif(p->>'reason',''),
         cancellation_type  = nullif(p->>'cancellation_type',''),
         cancelled_by       = nullif(p->>'actor_id','')::uuid,
         updated_at         = now()
   where id = o.id;

  -- INV-11: order-linked holds are released whenever the order leaves the payable
  -- lifecycle, INDEPENDENT of the physical restock decision — so no orphan hold can
  -- permanently reduce adjustable inventory. (Previously coupled to release_inventory.)
  delete from public.stock_reservations where order_id = o.id;

  -- Physical restock only when explicitly requested AND the order was paid (stock was
  -- decremented at finalize). Emits a system 'cancel_restock' movement per variant.
  if coalesce((p->>'release_inventory')::boolean, false) and o.payment_status <> 'pending' then
    for r in select variant_id, sum(quantity)::int as quantity
               from public.order_items where order_id = o.id and variant_id is not null
              group by variant_id loop
      v_res := public.apply_stock_movement(
        r.variant_id, r.quantity, 'cancel_restock', 'order', o.id, o.order_number,
        nullif(p->>'actor_id','')::uuid, null, null, null,
        'cancel:' || o.id::text || ':' || r.variant_id::text
      );
      if (v_res->>'applied')::boolean then v_restocked := v_restocked + r.quantity; end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'already_cancelled', false,
                            'previous_status', v_prev, 'restocked', v_restocked);
end $$;
revoke all on function public.cancel_order(jsonb) from public, anon, authenticated;
grant  execute on function public.cancel_order(jsonb) to service_role;

-- ── restock_return_items — ledgered, now truly idempotent ─────────────────────
-- Previously "idempotent by convention" (no guard). The movement idempotency key now
-- ENFORCES exactly-once per (return, variant): a retry is a no-op, but a DIFFERENT
-- return of the same variant (its own return_id) is a distinct, non-suppressed key.
create or replace function public.restock_return_items(p_return_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_res jsonb; v_total integer := 0;
begin
  for r in select variant_id, sum(quantity)::int as quantity
             from public.return_items
            where return_id = p_return_id and restock = true and variant_id is not null
            group by variant_id loop
    v_res := public.apply_stock_movement(
      r.variant_id, r.quantity, 'return_restock', 'return', p_return_id, null,
      null, null, null, null, 'return:' || p_return_id::text || ':' || r.variant_id::text
    );
    if (v_res->>'applied')::boolean then v_total := v_total + r.quantity; end if;
  end loop;
  return v_total;
end $$;
revoke all on function public.restock_return_items(uuid) from public, anon, authenticated;
grant  execute on function public.restock_return_items(uuid) to service_role;


-- ============================================================================
-- Opening balances — the ledger's starting point (req #5). One 'opening_balance'
-- movement per existing variant: before=0, delta=current stock, after=current stock.
-- It is the ANCHOR (records the pre-existing baseline); it does NOT mutate stock and
-- is the sole movement type exempt from "must accompany a stock change". Labelled
-- Opening balance, NOT Stock received (no fabricated procurement). Idempotent via key.
-- Extracted into an idempotent function so it is (a) callable once at deploy for the
-- existing catalog and (b) verifiable in tests. Returns the number of rows anchored.
-- ============================================================================
create or replace function public.backfill_opening_balances()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with ins as (
    insert into public.inventory_movements(
      variant_id, variant_ref, sku_snapshot, product_name_snapshot, variant_name_snapshot,
      quantity_before, quantity_delta, quantity_after, movement_type, source_type, idempotency_key, note
    )
    select v.id, v.id, v.sku, p.name, v.variant_name,
           0, v.stock, v.stock, 'opening_balance', 'system',
           'opening:' || v.id::text, 'Opening balance (ledger start)'
      from public.variants v
      join public.products p on p.id = v.product_id
     where not exists (select 1 from public.inventory_movements m where m.idempotency_key = 'opening:' || v.id::text)
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end $$;
revoke all on function public.backfill_opening_balances() from public, anon, authenticated;
grant  execute on function public.backfill_opening_balances() to service_role;

-- Anchor every variant that exists at ledger start (0 on a fresh DB; the real catalog on deploy).
select public.backfill_opening_balances();
