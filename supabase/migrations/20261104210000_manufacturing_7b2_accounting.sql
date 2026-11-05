-- ============================================================================
-- MANUFACTURING — Phase 7B-2 (part 1): accounting hardening (INERT, ADDITIVE)
-- ============================================================================
-- Resolves the Part-A critical accounting invariants:
--  • A.1 three independent results: accounting_explained / fully_reconciled / activation_eligible.
--  • A.4+A.2 the authorisation/attribution invariant is now DB-enforced by a DEFERRABLE
--    CONSTRAINT TRIGGER (checked at COMMIT), NOT a session setting: every post-activation
--    movement on a tracked variant must be fully attributed (sale may be short ONLY by an open
--    exception). Unknown/uncovered types fail closed (txn aborts). The session-flag guard is
--    dropped. This ALSO keeps return/RTO restock + untagged adjustment fail-closed for tracked
--    variants automatically (no overlay ⇒ commit aborts) until their batch-aware paths exist.
--  • A.5 an IMMUTABLE tracking epoch (append-only variant_tracking_epochs) classifies pre/post
--    activation movements durably (not the mutable variants.tracked_at).
--  • A.6 reconciliation covers ALL attribution-requiring movement types; opening_balance exempt;
--    unknown types require attribution (fail closed via the constraint).
-- Plus batch-aware manual adjustment (B.3), exception REALLOCATION recovery (B.4 attribution
-- repair), and a server-side fulfilment block predicate (B.5). apply_stock_movement UNCHANGED.
-- DO NOT activate tracking or push/deploy.
-- ============================================================================

-- ── A.5 Immutable tracking epoch (append-only) ───────────────────────────────
create table if not exists public.variant_tracking_epochs (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references public.variants(id) on delete restrict,
  epoch_at     timestamptz not null default now(),
  activated_by uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists vte_variant_idx on public.variant_tracking_epochs(variant_id, epoch_at desc);
alter table public.variant_tracking_epochs enable row level security;
grant select, insert on public.variant_tracking_epochs to service_role;  -- append-only (no update/delete)

-- ── A.4/A.2/A.6 DB-enforced attribution completeness (deferred constraint) ────
create or replace function public.tg_tracked_attribution_complete()
returns trigger language plpgsql
set search_path = ''
as $$
declare v_track text; v_epoch timestamptz; v_ov int; v_exc int;
begin
  select tracking_state into v_track from public.variants where id = new.variant_ref;
  if v_track is distinct from 'tracked' then return null; end if;                 -- untracked: untouched
  v_epoch := coalesce((select max(epoch_at) from public.variant_tracking_epochs where variant_id = new.variant_ref),
                      (select tracked_at from public.variants where id = new.variant_ref));
  if v_epoch is null or new.created_at < v_epoch then return null; end if;         -- pre-activation: exempt
  if new.movement_type = 'opening_balance' then return null; end if;              -- opening balances: exempt
  select coalesce(sum(qty), 0) into v_ov from public.batch_stock_entries where movement_id = new.id;
  if new.movement_type = 'sale' then
    -- a sale may be short ONLY by the open exception(s) attributed to it
    select coalesce(sum(shortfall_qty), 0) into v_exc from public.order_inventory_exceptions
      where movement_id = new.id and state not in ('resolved_allocated','resolved_refunded');
    if (v_ov - new.quantity_delta) <> v_exc then
      raise exception 'tracked attribution incomplete: sale movement % (overlay %, delta %, exception %)', new.id, v_ov, new.quantity_delta, v_exc using errcode = 'check_violation';
    end if;
  else
    -- every other attribution-requiring type (incl. unknown) must match exactly → fail closed
    if v_ov <> new.quantity_delta then
      raise exception 'tracked attribution incomplete: % movement % (overlay % <> delta %)', new.movement_type, new.id, v_ov, new.quantity_delta using errcode = 'check_violation';
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_tracked_variant_movement_guard on public.inventory_movements;  -- replace the session-flag guard
drop trigger if exists trg_tracked_attribution_complete on public.inventory_movements;
create constraint trigger trg_tracked_attribution_complete
  after insert on public.inventory_movements
  deferrable initially deferred
  for each row execute function public.tg_tracked_attribution_complete();

-- ── A.1/A.6 reconciliation v3 — three independent results ────────────────────
create or replace function public.variant_batch_reconciliation(p_variant_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with v as (select tracking_state, tracked_at from public.variants where id = p_variant_id),
  ep as (select coalesce((select max(epoch_at) from public.variant_tracking_epochs where variant_id = p_variant_id), (select tracked_at from v)) as epoch_at),
  mv as (  -- COMPLETE post-activation attribution-requiring movement set (all types except opening_balance)
    select coalesce(sum(m.quantity_delta),0)::int ledger_attributed
    from public.inventory_movements m, v, ep
    where m.variant_ref = p_variant_id and v.tracking_state = 'tracked'
      and ep.epoch_at is not null and m.created_at >= ep.epoch_at and m.movement_type <> 'opening_balance'
  ),
  ov as (select coalesce(sum(qty),0)::int overlay_sum from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null),
  ex as (select coalesce(sum(shortfall_qty),0)::int open_shortfall from public.order_inventory_exceptions
         where variant_id = p_variant_id and state not in ('resolved_allocated','resolved_refunded')),
  lg as (select state from public.variant_legacy_reconciliation where variant_id = p_variant_id)
  select jsonb_build_object(
    'variant_id', p_variant_id,
    'tracked', (select tracking_state = 'tracked' from v),
    'aggregate_stock', (select coalesce(stock,0) from public.variants where id = p_variant_id),
    'ledger_attributed', mv.ledger_attributed,
    'overlay_attributed', ov.overlay_sum,
    'open_exception_qty', ex.open_shortfall,
    'overlay_ledger_drift', ov.overlay_sum - mv.ledger_attributed,
    -- all differences are explained by valid OPEN exceptions (traceable, but NOT complete)
    'accounting_explained', (ov.overlay_sum - mv.ledger_attributed) = ex.open_shortfall,
    -- every mandatory attribution is complete AND no unresolved gaps remain
    'fully_reconciled', (ov.overlay_sum - mv.ledger_attributed) = 0 and ex.open_shortfall = 0,
    -- fully reconciled AND legacy explicitly classified → safe to consider for activation
    'activation_eligible', ((ov.overlay_sum - mv.ledger_attributed) = 0 and ex.open_shortfall = 0 and (select state from lg) = 'reconciled')
  ) from mv, ov, ex;
$$;

-- ── B.3 batch-aware manual adjustment (tracked variants) ─────────────────────
create or replace function public.adjust_batch_inventory(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant uuid := nullif(p->>'variant_id','')::uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_mode text := p->>'mode'; v_qty int := (p->>'qty')::int; v_reason text := nullif(p->>'reason',''); v_actor uuid := nullif(p->>'actor_id','')::uuid;
  v_idem text := nullif(p->>'idempotency_key',''); v_delta int; b public.manufacturing_batches%rowtype; v_mid uuid;
begin
  if v_variant is null or v_batch is null or v_mode not in ('add','remove') or v_qty is null or v_qty <= 0 or v_reason is null then
    raise exception 'adjust_batch_inventory: variant_id, batch_id, mode(add|remove), qty>0 and reason are required' using errcode = 'invalid_parameter_value';
  end if;
  if v_idem is not null and exists (select 1 from public.inventory_movements where idempotency_key = v_idem) then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  perform 1 from public.variants where id = v_variant for update;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> v_variant then raise exception 'adjust_batch_inventory: batch does not belong to variant' using errcode = 'check_violation'; end if;
  if (select tracking_state from public.variants where id = v_variant) <> 'tracked' then
    raise exception 'adjust_batch_inventory: variant is not tracked (use adjust_inventory)' using errcode = 'check_violation';
  end if;
  v_delta := case when v_mode = 'add' then v_qty else -v_qty end;
  perform public.apply_stock_movement(v_variant, v_delta, 'manual_adjustment', 'admin', v_batch, v_reason, v_actor, v_reason, null, jsonb_build_object('batch_id', v_batch), coalesce(v_idem, 'adj:' || gen_random_uuid()::text));
  v_mid := (select id from public.inventory_movements where variant_ref = v_variant and movement_type = 'manual_adjustment' order by created_at desc limit 1);
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_batch, v_variant, 'writeoff', v_delta, v_mid, 'admin', v_batch, v_reason, v_actor, 'adj_overlay:' || v_mid::text);
  return jsonb_build_object('ok', true, 'movement_id', v_mid, 'delta', v_delta);
end $$;

-- ── B.4 exception REALLOCATION recovery (attribution repair) ──────────────────
create or replace function public.reallocate_order_exception(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'exception_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
  e public.order_inventory_exceptions%rowtype; v_remaining int; vb record; v_take int; v_ordernum text;
begin
  if v_id is null then raise exception 'reallocate: exception_id required' using errcode = 'invalid_parameter_value'; end if;
  select * into e from public.order_inventory_exceptions where id = v_id for update;
  if not found then raise exception 'reallocate: % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if e.state in ('resolved_allocated','resolved_refunded') then return jsonb_build_object('ok', true, 'already_resolved', true); end if;
  perform 1 from public.variants where id = e.variant_id for update;
  select order_number into v_ordernum from public.orders where id = e.order_id;
  v_remaining := e.shortfall_qty;

  for vb in
    select b.id as bid, public.batch_onhand(b.id) as oh from public.manufacturing_batches b
    where b.variant_id = e.variant_id and b.recall_state = 'none'
      and b.lifecycle_status not in ('draft','in_production','curing','quality_check','rejected','closed')
      and exists (select 1 from public.batch_design_validations dv where dv.config_fingerprint = public.batch_config_fingerprint(b.id) and dv.result='pass' and dv.state='approved')
    order by b.manufacturing_date asc, b.production_sequence asc, b.id asc for update of b
  loop
    exit when v_remaining <= 0;
    if vb.oh <= 0 then continue; end if;
    v_take := least(v_remaining, vb.oh);
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (vb.bid, e.variant_id, 'sale', -v_take, e.movement_id, 'order', e.order_id, v_ordernum, v_actor, 'realloc_overlay:' || e.movement_id::text || ':' || vb.bid::text);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining <= 0 then
    update public.order_inventory_exceptions set state = 'resolved_allocated', shortfall_qty = shortfall_qty, resolved_at = pg_catalog.now(), resolved_by = v_actor, updated_at = pg_catalog.now() where id = v_id;
    return jsonb_build_object('ok', true, 'resolved', true);
  else
    update public.order_inventory_exceptions set state = 'pending_reallocation', shortfall_qty = v_remaining, updated_at = pg_catalog.now() where id = v_id;
    return jsonb_build_object('ok', true, 'resolved', false, 'remaining', v_remaining);
  end if;
end $$;

-- ── B.5 server-side fulfilment block predicate ───────────────────────────────
create or replace function public.order_allocation_blocked(p_order_id uuid)
returns boolean language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.order_inventory_exceptions
                 where order_id = p_order_id and state not in ('resolved_allocated','resolved_refunded'));
$$;

-- ── A.5 serialised activation: lock the variant, set state, stamp the immutable epoch ───
create or replace function public.activate_variant_tracking(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_variant uuid := nullif(p->>'variant_id','')::uuid; v_state text := p->>'state'; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_now timestamptz := pg_catalog.now();
begin
  if v_variant is null or v_state not in ('untracked','transition_pending','tracked') then
    raise exception 'activate_variant_tracking: variant_id and valid state required' using errcode = 'invalid_parameter_value';
  end if;
  perform 1 from public.variants where id = v_variant for update;   -- serialise against in-flight stock txns on this variant
  update public.variants set tracking_state = v_state, tracked_at = case when v_state = 'tracked' then coalesce(tracked_at, v_now) else tracked_at end where id = v_variant;
  if v_state = 'tracked' then
    insert into public.variant_tracking_epochs(variant_id, epoch_at, activated_by) values (v_variant, v_now, v_actor);  -- immutable, append-only
  end if;
  return jsonb_build_object('ok', true, 'variant_id', v_variant, 'state', v_state);
end $$;

revoke all on function public.activate_variant_tracking(jsonb)                from public, anon, authenticated;
grant  execute on function public.activate_variant_tracking(jsonb)            to service_role;
revoke all on function public.tg_tracked_attribution_complete()               from public, anon, authenticated;
revoke all on function public.variant_batch_reconciliation(uuid)              from public, anon, authenticated;
revoke all on function public.adjust_batch_inventory(jsonb)                   from public, anon, authenticated;
revoke all on function public.reallocate_order_exception(jsonb)               from public, anon, authenticated;
revoke all on function public.order_allocation_blocked(uuid)                  from public, anon, authenticated;
grant  execute on function public.variant_batch_reconciliation(uuid)          to service_role;
grant  execute on function public.adjust_batch_inventory(jsonb)               to service_role;
grant  execute on function public.reallocate_order_exception(jsonb)           to service_role;
grant  execute on function public.order_allocation_blocked(uuid)              to service_role;
