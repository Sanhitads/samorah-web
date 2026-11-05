-- ============================================================================
-- MANUFACTURING — Phase 7B-2 closure: refund/accounting consistency, disposition lifecycle
-- ============================================================================
-- Still INERT. ADDITIVE. apply_stock_movement UNCHANGED. Fixes the refund/accounting
-- contradiction and separates the three concerns that were conflated:
--
--  ROOT CAUSE (verified in SQL, NOT inferred): finalize_order posts the FULL sale movement
--  (apply_stock_movement(variant, -qty,'sale')) which decrements variants.stock by the full
--  ordered quantity; allocate_order_batches then records the un-attributable remainder as an
--  order_inventory_exception WITHOUT any further aggregate movement. So a shortfall's units ARE
--  deducted from variants.stock — they are simply NOT attributed to a batch overlay. The prior
--  claim "never deducted" was wrong; a refund that posts nothing therefore left the aggregate
--  decrement UNATTRIBUTED, and the reconciliation (which only counted OPEN exceptions) reported
--  it as an UNEXPLAINED drift once the exception moved to resolved_refunded.
--
--  THREE SEPARATE CONCERNS, now handled distinctly:
--   1. Financial refund  — refunds ledger only (resolve_exception_by_refund); NO stock movement.
--   2. Attribution       — reconciliation v4 counts refunded shortfalls as STILL EXPLAINING the
--                          drift (no false "unexplained"); fully_reconciled still needs drift 0.
--   3. Physical dispo     — dispose_exception_shortfall attributes the consumed units to a named
--                          batch (movement-backed overlay on the EXISTING sale movement), closing
--                          the drift to 0. It restores NOTHING to sellable (no positive movement);
--                          the refunded units are written off FROM a batch that physically holds them.
--
--  Also: receipt-hold + quarantine disposition lifecycle (no double counting), and a broadened
--  fulfilment-block predicate (cancelled / fully-refunded). DO NOT activate or push/deploy.
-- ============================================================================

-- ── Exception gains a terminal physical-writeoff state ───────────────────────
alter table public.order_inventory_exceptions drop constraint if exists order_inventory_exceptions_state_check;
alter table public.order_inventory_exceptions add constraint order_inventory_exceptions_state_check
  check (state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated',
                   'resolved_allocated','resolved_refunded','resolved_written_off'));

-- ── Reconciliation v4 — refunded shortfalls still EXPLAIN the drift ───────────
create or replace function public.variant_batch_reconciliation(p_variant_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with v as (select tracking_state, tracked_at from public.variants where id = p_variant_id),
  ep as (select coalesce((select max(epoch_at) from public.variant_tracking_epochs where variant_id = p_variant_id), (select tracked_at from v)) as epoch_at),
  mv as (
    select coalesce(sum(m.quantity_delta),0)::int ledger_attributed
    from public.inventory_movements m, v, ep
    where m.variant_ref = p_variant_id and v.tracking_state = 'tracked'
      and ep.epoch_at is not null and m.created_at >= ep.epoch_at and m.movement_type <> 'opening_balance'
  ),
  ov as (select coalesce(sum(qty),0)::int overlay_sum from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null),
  -- OPEN = operationally unresolved (still needs reallocation or refund).
  exo as (select coalesce(sum(shortfall_qty),0)::int q from public.order_inventory_exceptions
          where variant_id = p_variant_id and state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated')),
  -- REFUNDED-but-undisposed: financially closed, physical units not yet written off → STILL explains the drift.
  exr as (select coalesce(sum(shortfall_qty),0)::int q from public.order_inventory_exceptions
          where variant_id = p_variant_id and state = 'resolved_refunded'),
  lg as (select state from public.variant_legacy_reconciliation where variant_id = p_variant_id)
  select jsonb_build_object(
    'variant_id', p_variant_id,
    'tracked', (select tracking_state = 'tracked' from v),
    'aggregate_stock', (select coalesce(stock,0) from public.variants where id = p_variant_id),
    'ledger_attributed', mv.ledger_attributed,
    'overlay_attributed', ov.overlay_sum,
    'open_exception_qty', exo.q,
    'refunded_exception_qty', exr.q,
    'overlay_ledger_drift', ov.overlay_sum - mv.ledger_attributed,
    -- The drift is fully traceable to open + refunded-undisposed exceptions (NOT an unexplained gap).
    'accounting_explained', (ov.overlay_sum - mv.ledger_attributed) = (exo.q + exr.q),
    -- Complete: no drift AND nothing operationally open AND no refunded shortfall awaiting physical writeoff.
    'fully_reconciled', ((ov.overlay_sum - mv.ledger_attributed) = 0 and exo.q = 0 and exr.q = 0),
    'activation_eligible', ((ov.overlay_sum - mv.ledger_attributed) = 0 and exo.q = 0 and exr.q = 0 and (select state from lg) = 'reconciled')
  ) from mv, ov, exo, exr;
$$;

-- ── Physical disposition of a REFUNDED shortfall (separate from the refund) ───
-- Attributes the units the (already refunded) sale consumed to a NAMED batch that physically holds
-- them, via a movement-backed overlay on the EXISTING sale movement — closing the attribution drift
-- to 0. Issues NO positive inventory movement; restores NOTHING to sellable. The batch must actually
-- hold the units (per-batch non-negativity enforces this). Requires the exception already refunded.
create or replace function public.dispose_exception_shortfall(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'exception_id','')::uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  e public.order_inventory_exceptions%rowtype; mvt public.inventory_movements%rowtype;
  v_attr int; b public.manufacturing_batches%rowtype;
begin
  if v_id is null or v_batch is null then
    raise exception 'dispose_shortfall: exception_id and batch_id required' using errcode = 'invalid_parameter_value';
  end if;
  select * into e from public.order_inventory_exceptions where id = v_id for update;
  if not found then raise exception 'dispose_shortfall: exception % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if e.state = 'resolved_written_off' then return jsonb_build_object('ok', true, 'already_disposed', true); end if;
  if e.state <> 'resolved_refunded' then
    raise exception 'dispose_shortfall: exception must be resolved_refunded first (financial evidence required), got %', e.state using errcode = 'check_violation';
  end if;
  perform 1 from public.variants where id = e.variant_id for update;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> e.variant_id then
    raise exception 'dispose_shortfall: batch % does not belong to the exception variant', v_batch using errcode = 'check_violation';
  end if;
  select * into mvt from public.inventory_movements where id = e.movement_id;
  if not found or mvt.movement_type <> 'sale' then
    raise exception 'dispose_shortfall: exception has no sale movement to attribute' using errcode = 'check_violation';
  end if;
  -- Never attribute more overlay than the sale actually deducted.
  select coalesce(sum(qty),0) into v_attr from public.batch_stock_entries where movement_id = e.movement_id;  -- negative
  if abs(v_attr) + e.shortfall_qty > abs(mvt.quantity_delta) then
    raise exception 'dispose_shortfall: would over-attribute the sale movement' using errcode = 'check_violation';
  end if;
  -- Movement-backed overlay: consume the refunded units FROM the batch (writeoff), closing the drift.
  -- Sign matches the sale movement (negative). Per-batch non-negativity guarantees the batch holds them.
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_batch, e.variant_id, 'writeoff', -e.shortfall_qty, e.movement_id, 'order', e.order_id,
          coalesce(v_reason, 'refunded shortfall written off'), v_actor, 'exc_writeoff:' || e.id::text);
  update public.order_inventory_exceptions
     set state = 'resolved_written_off', reason = coalesce(v_reason, reason), resolved_at = pg_catalog.now(), resolved_by = v_actor, updated_at = pg_catalog.now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'written_off', e.shortfall_qty, 'batch_id', v_batch);
end $$;

-- ── Receipt-hold disposition lifecycle (held → restocked | quarantined | written_off) ───
-- A batch_receipt_hold is physically received stock that was NEVER added to sellable (no movement).
-- Resolving it exactly once (terminal state ⇒ no double counting):
--   restock   — units confirmed in an ELIGIBLE batch → post +return_restock movement + overlay (sellable).
--   quarantine— record batch_quarantine 'held' against a named batch; no stock change.
--   writeoff  — discard; no stock change (they were never sellable).
create or replace function public.resolve_receipt_hold(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'hold_id','')::uuid; v_mode text := p->>'mode'; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  h public.batch_receipt_holds%rowtype; b public.manufacturing_batches%rowtype; v_mid uuid; v_key text; v_fp text;
begin
  if v_id is null or v_mode not in ('restock','quarantine','writeoff') then
    raise exception 'resolve_hold: hold_id and mode(restock|quarantine|writeoff) required' using errcode = 'invalid_parameter_value';
  end if;
  select * into h from public.batch_receipt_holds where id = v_id for update;
  if not found then raise exception 'resolve_hold: hold % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if h.state <> 'held' then return jsonb_build_object('ok', true, 'already_resolved', true, 'state', h.state); end if;
  perform 1 from public.variants where id = h.variant_id for update;

  if v_mode = 'writeoff' then
    update public.batch_receipt_holds set state = 'resolved_writeoff', reason = coalesce(v_reason, reason), resolved_by = v_actor, resolved_at = pg_catalog.now() where id = v_id;
    return jsonb_build_object('ok', true, 'mode', 'writeoff', 'qty', h.qty);
  end if;

  if v_batch is null then raise exception 'resolve_hold: batch_id required for % ', v_mode using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> h.variant_id then raise exception 'resolve_hold: batch does not belong to variant' using errcode = 'check_violation'; end if;

  if v_mode = 'quarantine' then
    insert into public.batch_quarantine(batch_id, variant_id, qty, reason, actor_id)
    values (v_batch, h.variant_id, h.qty, coalesce(v_reason, 'receipt hold quarantined'), v_actor);
    update public.batch_receipt_holds set state = 'resolved_quarantined', reason = coalesce(v_reason, reason), resolved_by = v_actor, resolved_at = pg_catalog.now() where id = v_id;
    return jsonb_build_object('ok', true, 'mode', 'quarantine', 'qty', h.qty, 'batch_id', v_batch);
  end if;

  -- restock: the batch must be ELIGIBLE (not recalled/held) before units re-enter sellable stock.
  if b.recall_state <> 'none' then raise exception 'resolve_hold: cannot restock to a recalled/held batch' using errcode = 'check_violation'; end if;
  v_fp := public.batch_config_fingerprint(v_batch);
  if not exists (select 1 from public.batch_design_validations where config_fingerprint = v_fp and result = 'pass' and state = 'approved') then
    raise exception 'resolve_hold: batch has no approved design validation — not eligible to restock' using errcode = 'check_violation';
  end if;
  v_key := 'hold_restock:' || h.id::text;
  perform public.apply_stock_movement(h.variant_id, h.qty, 'return_restock', 'return', h.order_id,
    coalesce(v_reason,'receipt hold restock'), v_actor, null, null,
    jsonb_build_object('hold_id', h.id), v_key);
  v_mid := (select id from public.inventory_movements where idempotency_key = v_key);
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_batch, h.variant_id, 'return_restock', h.qty, v_mid, 'order', h.order_id, coalesce(v_reason,'receipt hold restock'), v_actor, 'hold_overlay:' || v_mid::text);
  update public.batch_receipt_holds set state = 'resolved_restocked', reason = coalesce(v_reason, reason), resolved_by = v_actor, resolved_at = pg_catalog.now() where id = v_id;
  return jsonb_build_object('ok', true, 'mode', 'restock', 'qty', h.qty, 'batch_id', v_batch, 'movement_id', v_mid);
end $$;

-- ── Broadened fulfilment-block predicate (exception OR cancelled OR fully refunded) ───
create or replace function public.order_fulfillment_blocked(p_order_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'blocked', (t.exc or t.cancelled or t.fully_refunded),
    'reason', case when t.exc then 'allocation_exception'
                   when t.cancelled then 'cancelled'
                   when t.fully_refunded then 'fully_refunded' else null end
  ) from (
    select
      exists(select 1 from public.order_inventory_exceptions
             where order_id = p_order_id and state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated')) as exc,
      (select status = 'cancelled' from public.orders where id = p_order_id) as cancelled,
      (select payment_status = 'refunded' from public.orders where id = p_order_id) as fully_refunded
  ) t;
$$;

revoke all on function public.dispose_exception_shortfall(jsonb)             from public, anon, authenticated;
revoke all on function public.resolve_receipt_hold(jsonb)                    from public, anon, authenticated;
revoke all on function public.variant_batch_reconciliation(uuid)            from public, anon, authenticated;
revoke all on function public.order_fulfillment_blocked(uuid)               from public, anon, authenticated;
grant  execute on function public.dispose_exception_shortfall(jsonb)         to service_role;
grant  execute on function public.resolve_receipt_hold(jsonb)                to service_role;
grant  execute on function public.variant_batch_reconciliation(uuid)        to service_role;
grant  execute on function public.order_fulfillment_blocked(uuid)           to service_role;
