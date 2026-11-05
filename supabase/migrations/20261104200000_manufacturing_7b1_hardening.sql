-- ============================================================================
-- MANUFACTURING — Phase 7B-1: stock accounting, payment exceptions, writer hardening
-- ============================================================================
-- Still INERT (no live tracked variant; both switches default disabled). Changes:
--  • Tracked sale allocation no longer "silently completes" on shortfall — it records a
--    DURABLE, idempotent order_inventory_exception (payment preserved, fulfilment blocked),
--    never fabricating stock.
--  • A txn-local flag gates not-yet-batch-aware restock/adjust movements on tracked variants:
--    only a sanctioned batch-aware RPC (which also writes attribution) may post them; ad-hoc
--    untagged writes fail closed (DB-enforced).
--  • cancel_order is batch-aware for tracked variants: restores ELIGIBLE original-batch units
--    to sellable (exact overlay), routes recalled/held original units to QUARANTINE (never
--    auto-sellable), marks allocations cancelled, reconciles exactly.
--  • Reconciliation is exception-aware (a missing overlay surfaces as an open exception, it
--    never disappears). return/RTO restock + manual adjustment on tracked remain FAIL-CLOSED
--    (batch-aware workflows are a later phase; activation stays blocked until then).
-- apply_stock_movement is UNCHANGED. DO NOT activate tracking or push/deploy.
-- ============================================================================

-- ── 1. Durable payment/allocation exception (A.1, A.7) ───────────────────────
create table if not exists public.order_inventory_exceptions (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete restrict,
  variant_id    uuid not null references public.variants(id) on delete restrict,
  movement_id   uuid references public.inventory_movements(id) on delete restrict,
  shortfall_qty integer not null check (shortfall_qty > 0),
  state         text not null default 'captured_unallocated'
                  check (state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated','resolved_allocated','resolved_refunded')),
  reason        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id) on delete set null,
  unique (order_id, variant_id)   -- idempotent across finalize retries
);
create index if not exists oie_open_idx on public.order_inventory_exceptions(state) where state not in ('resolved_allocated','resolved_refunded');
alter table public.order_inventory_exceptions enable row level security;
grant select, insert, update on public.order_inventory_exceptions to service_role;

-- ── 2. Flag-gated fail-closed guard (A.3) ────────────────────────────────────
-- Not-yet-batch-aware movement types on a TRACKED variant are refused UNLESS a sanctioned
-- batch-aware RPC has set the txn-local flag app.mfg_batch_aware='1' (and thus will write
-- attribution). 'sale' (attributed by allocate_order_batches) and 'batch_release' are exempt.
create or replace function public.tg_tracked_variant_movement_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.movement_type in ('cancel_restock','return_restock','rto_restock','manual_adjustment')
     and (select tracking_state from public.variants where id = new.variant_ref) = 'tracked'
     and coalesce(current_setting('app.mfg_batch_aware', true), '') <> '1' then
    raise exception 'inventory: % on a tracked variant must go through a batch-aware RPC (fails closed)', new.movement_type
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
-- (trigger already exists from 7A; function body replaced in place.)

-- ── 3. allocate_order_batches — shortfall becomes a DURABLE exception (A.1) ───
create or replace function public.allocate_order_batches(p_order_id uuid, p_actor uuid)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean; v_ordernum text; r record; v_remaining int; vb record; v_take int;
  v_bids uuid[]; v_bq int[]; v_oiids uuid[]; v_oiq int[]; i int; j int; v_slice int; v_exceptions int := 0;
begin
  select allocation_enabled into v_enabled from public.manufacturing_settings where id = true;
  if not coalesce(v_enabled, false) then return jsonb_build_object('allocated', false, 'reason', 'disabled'); end if;
  select order_number into v_ordernum from public.orders where id = p_order_id;

  for r in
    select m.id as movement_id, m.variant_ref as variant_id, (-m.quantity_delta) as sold
    from public.inventory_movements m
    where m.source_type = 'order' and m.source_id = p_order_id and m.movement_type = 'sale'
    order by m.variant_ref
  loop
    if (select tracking_state from public.variants where id = r.variant_id) <> 'tracked' then continue; end if;
    v_remaining := r.sold; v_bids := '{}'; v_bq := '{}';

    for vb in
      select b.id as bid, public.batch_onhand(b.id) as oh
      from public.manufacturing_batches b
      where b.variant_id = r.variant_id and b.recall_state = 'none'
        and b.lifecycle_status not in ('draft','in_production','curing','quality_check','rejected','closed')
        and exists (select 1 from public.batch_design_validations dv
                     where dv.config_fingerprint = public.batch_config_fingerprint(b.id) and dv.result = 'pass' and dv.state = 'approved')
      order by b.manufacturing_date asc, b.production_sequence asc, b.id asc
      for update of b
    loop
      exit when v_remaining <= 0;
      if vb.oh <= 0 then continue; end if;
      v_take := least(v_remaining, vb.oh);
      insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
      values (vb.bid, r.variant_id, 'sale', -v_take, r.movement_id, 'order', p_order_id, v_ordernum, p_actor, 'sale_overlay:' || r.movement_id::text || ':' || vb.bid::text);
      v_bids := v_bids || vb.bid; v_bq := v_bq || v_take; v_remaining := v_remaining - v_take;
    end loop;

    select array_agg(id order by id), array_agg(quantity order by id) into v_oiids, v_oiq
      from public.order_items where order_id = p_order_id and variant_id = r.variant_id;
    if v_oiids is not null and array_length(v_bids, 1) is not null then
      i := 1; j := 1;
      while i <= array_length(v_bids, 1) and j <= array_length(v_oiids, 1) loop
        v_slice := least(v_bq[i], v_oiq[j]);
        if v_slice > 0 then
          insert into public.batch_allocations(order_id, order_item_id, variant_id, batch_id, qty, sale_movement_id)
          values (p_order_id, v_oiids[j], r.variant_id, v_bids[i], v_slice, r.movement_id)
          on conflict (order_item_id, variant_id, batch_id, component_key) do update set qty = public.batch_allocations.qty + excluded.qty;
          v_bq[i] := v_bq[i] - v_slice; v_oiq[j] := v_oiq[j] - v_slice;
        end if;
        if v_bq[i] <= 0 then i := i + 1; end if;
        if v_oiq[j] <= 0 then j := j + 1; end if;
      end loop;
    end if;

    if v_remaining > 0 then
      -- DURABLE, idempotent exception. Payment is preserved; the order is NOT fully allocated and
      -- must not proceed to normal fulfilment until operationally resolved. Nothing is fabricated.
      insert into public.order_inventory_exceptions(order_id, variant_id, movement_id, shortfall_qty, reason)
      values (p_order_id, r.variant_id, r.movement_id, v_remaining, 'insufficient eligible batch stock at finalisation')
      on conflict (order_id, variant_id) do nothing;
      insert into public.audit_logs(action, entity_type, entity_id, after_data)
      values ('inventory.allocation_exception', 'order', p_order_id, jsonb_build_object('variant_id', r.variant_id, 'shortfall', v_remaining));
      v_exceptions := v_exceptions + 1;
    end if;
  end loop;
  return jsonb_build_object('allocated', true, 'exceptions', v_exceptions);
end $$;

-- ── 4. cancel_order — batch-aware for tracked variants (A.4, A.10) ────────────
-- Reproduced VERBATIM from 20260816120000 + a tracked branch in the restock loop. Untracked
-- behaviour is byte-identical. Tracked: restore ELIGIBLE original-batch units to sellable
-- (exact overlay back to the SAME batches, from batch_allocations), route recalled/held
-- original units to QUARANTINE (never auto-sellable), mark allocations 'cancelled'.
create or replace function public.cancel_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  o public.orders%rowtype; v_prev public.order_status; v_restocked integer := 0; v_res jsonb; r record;
  a record; v_mid uuid; v_elig int; v_quar int;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status = 'cancelled' then return jsonb_build_object('ok', true, 'already_cancelled', true, 'previous_status', o.status); end if;
  if o.status in ('shipped','delivered','returned','rto') then return jsonb_build_object('ok', false, 'reason', 'not_cancellable', 'previous_status', o.status); end if;

  v_prev := o.status;
  update public.orders set status='cancelled', cancelled_at=now(), cancel_reason=nullif(p->>'reason',''),
         cancellation_type=nullif(p->>'cancellation_type',''), cancelled_by=nullif(p->>'actor_id','')::uuid, updated_at=now()
   where id = o.id;
  delete from public.stock_reservations where order_id = o.id;

  if coalesce((p->>'release_inventory')::boolean, false) and o.payment_status <> 'pending' then
    for r in select variant_id, sum(quantity)::int as quantity
               from public.order_items where order_id = o.id and variant_id is not null group by variant_id loop
      if (select tracking_state from public.variants where id = r.variant_id) = 'tracked' then
        -- Batch-aware reverse: eligible original batches become sellable again; recalled/held → quarantine.
        perform set_config('app.mfg_batch_aware', '1', true);
        v_elig := coalesce((select sum(ba.qty)::int from public.batch_allocations ba
                     join public.manufacturing_batches b on b.id = ba.batch_id
                     where ba.order_id = o.id and ba.variant_id = r.variant_id and ba.state in ('allocated','picked','shipped') and b.recall_state = 'none'), 0);
        v_quar := coalesce((select sum(ba.qty)::int from public.batch_allocations ba
                     join public.manufacturing_batches b on b.id = ba.batch_id
                     where ba.order_id = o.id and ba.variant_id = r.variant_id and ba.state in ('allocated','picked','shipped') and b.recall_state <> 'none'), 0);
        if v_elig > 0 then
          perform public.apply_stock_movement(r.variant_id, v_elig, 'cancel_restock', 'order', o.id, o.order_number,
            nullif(p->>'actor_id','')::uuid, null, null, null, 'cancel:' || o.id::text || ':' || r.variant_id::text);
          v_mid := (select id from public.inventory_movements where idempotency_key = 'cancel:' || o.id::text || ':' || r.variant_id::text);
          for a in select ba.batch_id, sum(ba.qty)::int as q from public.batch_allocations ba
                     join public.manufacturing_batches b on b.id = ba.batch_id
                     where ba.order_id = o.id and ba.variant_id = r.variant_id and ba.state in ('allocated','picked','shipped') and b.recall_state = 'none'
                     group by ba.batch_id loop
            insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
            values (a.batch_id, r.variant_id, 'cancel_restock', a.q, v_mid, 'order', o.id, o.order_number, nullif(p->>'actor_id','')::uuid, 'cancel_overlay:' || v_mid::text || ':' || a.batch_id::text);
          end loop;
          v_restocked := v_restocked + v_elig;
        end if;
        if v_quar > 0 then
          for a in select ba.batch_id, sum(ba.qty)::int as q from public.batch_allocations ba
                     join public.manufacturing_batches b on b.id = ba.batch_id
                     where ba.order_id = o.id and ba.variant_id = r.variant_id and ba.state in ('allocated','picked','shipped') and b.recall_state <> 'none'
                     group by ba.batch_id loop
            insert into public.batch_quarantine(batch_id, variant_id, qty, reason, actor_id)
            values (a.batch_id, r.variant_id, a.q, 'cancelled order returned units of a held/recalled batch', nullif(p->>'actor_id','')::uuid);
          end loop;
        end if;
        update public.batch_allocations set state = 'cancelled' where order_id = o.id and variant_id = r.variant_id and state in ('allocated','picked','shipped');
      else
        -- Untracked (all production today): unchanged.
        v_res := public.apply_stock_movement(r.variant_id, r.quantity, 'cancel_restock', 'order', o.id, o.order_number,
          nullif(p->>'actor_id','')::uuid, null, null, null, 'cancel:' || o.id::text || ':' || r.variant_id::text);
        if (v_res->>'applied')::boolean then v_restocked := v_restocked + r.quantity; end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'already_cancelled', false, 'previous_status', v_prev, 'restocked', v_restocked);
end $$;

-- ── 5. Exception-aware reconciliation (A.2) ──────────────────────────────────
create or replace function public.variant_batch_reconciliation(p_variant_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  -- Begin from the COMPLETE authoritative movement set for the variant (A.2) — not only the
  -- overlay-referenced subset — so a missing overlay cannot disappear from the calculation.
  -- Only POST-ACTIVATION movements require attribution: durable evidence = variants.tracked_at
  -- (null ⇒ untracked ⇒ nothing requires attribution; pre-tracked_at history is exempt).
  with trk as (select tracked_at from public.variants where id = p_variant_id),
  mv as (
    select coalesce(sum(m.quantity_delta),0)::int ledger_attributed
    from public.inventory_movements m, trk
    where m.variant_ref = p_variant_id
      and m.movement_type in ('sale','batch_release','cancel_restock','return_restock','rto_restock')
      and trk.tracked_at is not null and m.created_at >= trk.tracked_at
  ),
  ov as (select coalesce(sum(qty),0)::int overlay_sum from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null),
  ex as (select coalesce(sum(shortfall_qty),0)::int open_shortfall from public.order_inventory_exceptions
         where variant_id = p_variant_id and state not in ('resolved_allocated','resolved_refunded'))
  select jsonb_build_object(
    'variant_id', p_variant_id,
    'tracked', (select tracked_at is not null from trk),
    'aggregate_stock', (select coalesce(stock,0) from public.variants where id = p_variant_id),
    'tracked_onhand', (select coalesce(sum(qty),0) from public.batch_stock_entries where variant_id = p_variant_id),
    'overlay_attributed', ov.overlay_sum,
    'ledger_attributed', mv.ledger_attributed,
    'open_exception_qty', ex.open_shortfall,
    'overlay_ledger_drift', ov.overlay_sum - mv.ledger_attributed,
    -- An unattributed sale shortfall (negative delta, no overlay) leaves overlay_sum higher than
    -- the ledger by exactly the open shortfall; reconciled ⇔ the only gap IS the open exception(s).
    'reconciled', (ov.overlay_sum - mv.ledger_attributed) = ex.open_shortfall
  ) from mv, ov, ex;
$$;

-- ── 6. Exception state transitions (A.7) ─────────────────────────────────────
create or replace function public.resolve_order_inventory_exception(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := nullif(p->>'exception_id','')::uuid; v_to text := nullif(p->>'to_state',''); v_actor uuid := nullif(p->>'actor_id','')::uuid; e public.order_inventory_exceptions%rowtype;
begin
  if v_id is null or v_to is null then raise exception 'resolve_exception: exception_id and to_state required' using errcode = 'invalid_parameter_value'; end if;
  if v_to not in ('pending_reallocation','refund_required','refund_initiated','resolved_allocated','resolved_refunded') then
    raise exception 'resolve_exception: invalid target state %', v_to using errcode = 'invalid_parameter_value';
  end if;
  select * into e from public.order_inventory_exceptions where id = v_id for update;
  if not found then raise exception 'resolve_exception: % not found', v_id using errcode = 'foreign_key_violation'; end if;
  update public.order_inventory_exceptions
     set state = v_to, reason = coalesce(nullif(p->>'reason',''), reason),
         resolved_at = case when v_to in ('resolved_allocated','resolved_refunded') then pg_catalog.now() else resolved_at end,
         resolved_by = case when v_to in ('resolved_allocated','resolved_refunded') then v_actor else resolved_by end,
         updated_at = pg_catalog.now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'state', v_to);
end $$;

revoke all on function public.allocate_order_batches(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.cancel_order(jsonb)                             from public, anon, authenticated;
revoke all on function public.variant_batch_reconciliation(uuid)              from public, anon, authenticated;
revoke all on function public.resolve_order_inventory_exception(jsonb)        from public, anon, authenticated;
grant  execute on function public.allocate_order_batches(uuid, uuid)          to service_role;
grant  execute on function public.cancel_order(jsonb)                         to service_role;
grant  execute on function public.variant_batch_reconciliation(uuid)          to service_role;
grant  execute on function public.resolve_order_inventory_exception(jsonb)    to service_role;
