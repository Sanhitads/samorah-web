-- ============================================================================
-- MANUFACTURING — Phase 8 closure / hardening (INERT, ADDITIVE)
-- ============================================================================
-- apply_stock_movement unchanged; variants.stock never changed here. Addresses the Phase 8 review:
--  #1 IMMUTABLE allocation history: confirm_pick_batch and confirm_shipment_provenance NO LONGER mutate
--     batch_allocations (the payment-time logical record stays immutable). Actual provenance lives in the
--     append-only batch_pick_confirmations (incl. is_substitution, allocated_batch_id, reason, actor, ts)
--     and is frozen into shipment_batch_lines. Current derived state = those append-only events.
--  #1 Returns reference the ACTUAL shipped batch: attribute_receipt_restock now sources provenance as
--     shipment_batch_lines → batch_pick_confirmations → batch_allocations (order_variant_provenance).
--  #2 Dispatch gate: assert_tracked_shipment_ready(order) — full confirmation, eligible batches NOW,
--     current passing packing QC, no block/exception/ambiguous-refund/cancel/refund; confirm_shipment_
--     provenance refuses unless ready and re-checks batch eligibility at freeze.
--  #4 Entitlement: remaining_to_pick / remaining_to_ship / cancelled_qty surfaced.
--  #5 Packing QC validity: a QC record carries the pick fingerprint; changing a pick supersedes it, and
--     dispatch requires a passing QC whose fingerprint matches the CURRENT picks.
--  #6 Write-off conservation: dispose_exception_shortfall rejects consuming more than current batch on-hand.
-- DO NOT activate tracking, push or deploy.
-- ============================================================================

alter table public.packing_qc_checks add column if not exists pick_fingerprint text;

-- ── Current pick fingerprint for an order (changes whenever a pick is (re)confirmed) ──
create or replace function public.order_pick_fingerprint(p_order_id uuid)
returns text language sql stable set search_path = '' as $$
  select coalesce(count(*)::text || ':' || coalesce(sum(qty),0)::text || ':' || coalesce(max(confirmed_at)::text,''), '0:0:')
  from public.batch_pick_confirmations where order_id = p_order_id;
$$;

-- ── Actual-provenance source for an order/variant: shipped → picked → logical allocation ──
create or replace function public.order_variant_provenance(p_order uuid, p_variant uuid)
returns table(batch_id uuid, qty int) language sql stable set search_path = '' as $$
  with src as (
    select case
      when exists (select 1 from public.shipment_batch_lines where order_id = p_order and variant_id = p_variant) then 'ship'
      when exists (select 1 from public.batch_pick_confirmations where order_id = p_order and variant_id = p_variant) then 'pick'
      else 'alloc' end as s)
  select u.batch_id, sum(u.qty)::int from (
    select batch_id, qty from public.shipment_batch_lines where order_id = p_order and variant_id = p_variant and (select s from src) = 'ship'
    union all
    select batch_id, qty from public.batch_pick_confirmations where order_id = p_order and variant_id = p_variant and (select s from src) = 'pick'
    union all
    select batch_id, qty from public.batch_allocations where order_id = p_order and variant_id = p_variant
      and state in ('allocated','picked','shipped','returned') and (select s from src) = 'alloc'
  ) u group by u.batch_id;
$$;

-- ── #4 entitlement v2 — remaining-to-pick / remaining-to-ship / cancelled ────
create or replace function public.order_item_entitlements(p_order_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with o as (select status, payment_status, total_amount, coalesce(refund_amount,0) as refund_amount from public.orders where id = p_order_id),
  exc as (select exists(select 1 from public.order_inventory_exceptions
            where order_id = p_order_id and state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated')) as open_exc),
  refl as (select oi.id as order_item_id, coalesce(sum(ri.quantity),0)::int as refunded_identifiable
             from public.order_items oi
             left join public.return_items ri on ri.order_item_id = oi.id
             left join public.returns r on r.id = ri.return_id and r.status in ('refund','closed')
            where oi.order_id = p_order_id group by oi.id),
  amb as (select ((select payment_status from o) = 'partially_refunded'
                  and (select refund_amount from o) > coalesce((select sum(oi.line_total) from public.order_items oi
                         join refl on refl.order_item_id = oi.id where refl.refunded_identifiable > 0), 0)) as ambiguous_partial_refund),
  items as (
    select oi.id, oi.variant_id, oi.is_bundle, oi.quantity as ordered,
      coalesce((select sum(ba.qty) from public.batch_allocations ba where ba.order_item_id = oi.id and ba.state in ('allocated','picked','shipped')),0)::int as allocated,
      coalesce((select sum(ba.qty) from public.batch_allocations ba where ba.order_item_id = oi.id and ba.state = 'cancelled'),0)::int as cancelled_qty,
      coalesce((select sum(pc.qty) from public.batch_pick_confirmations pc where pc.order_item_id = oi.id),0)::int as picked_confirmed,
      coalesce((select sum(sl.qty) from public.shipment_batch_lines sl where sl.order_item_id = oi.id),0)::int as shipped,
      coalesce((select refunded_identifiable from refl where refl.order_item_id = oi.id),0)::int as refunded_identifiable,
      coalesce(oi.picked_qty,0) as picked_qty, (select tracking_state from public.variants where id = oi.variant_id) as tracking_state
    from public.order_items oi where oi.order_id = p_order_id
  )
  select jsonb_build_object(
    'order_id', p_order_id,
    'order_blocked', ((select open_exc from exc) or (select status from o) = 'cancelled' or (select payment_status from o) = 'refunded' or (select ambiguous_partial_refund from amb)),
    'block_reason', case when (select open_exc from exc) then 'allocation_exception'
                         when (select status from o) = 'cancelled' then 'cancelled'
                         when (select payment_status from o) = 'refunded' then 'fully_refunded'
                         when (select ambiguous_partial_refund from amb) then 'ambiguous_partial_refund'
                         else null end,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'order_item_id', id, 'variant_id', variant_id, 'is_bundle', is_bundle, 'tracked', tracking_state = 'tracked',
        'ordered', ordered, 'allocated', allocated, 'cancelled_qty', cancelled_qty, 'picked_qty', picked_qty,
        'picked_confirmed', picked_confirmed, 'shipped', shipped, 'refunded_identifiable', refunded_identifiable,
        'remaining_fulfillable', greatest(0, ordered - shipped - refunded_identifiable),
        'remaining_to_pick', greatest(0, ordered - shipped - refunded_identifiable - picked_confirmed),
        'remaining_to_ship', greatest(0, picked_confirmed - shipped)
      )) from items), '[]'::jsonb)
  );
$$;

-- ── #1 confirm_pick_batch — NO allocation mutation (immutable history) ────────
create or replace function public.confirm_pick_batch(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oi uuid := nullif(p->>'order_item_id','')::uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_qty int := (p->>'qty')::int; v_actor uuid := nullif(p->>'actor_id','')::uuid;
  v_comp text := coalesce(p->>'component_key',''); v_reason text := nullif(p->>'reason','');
  oi public.order_items%rowtype; b public.manufacturing_batches%rowtype; v_order uuid; v_variant uuid;
  v_ent jsonb; v_item jsonb; v_remaining int; v_already int; v_alloc_batch uuid; v_sub boolean := false; v_fp text;
begin
  if v_oi is null or v_batch is null or v_qty is null or v_qty <= 0 then
    raise exception 'confirm_pick: order_item_id, batch_id, qty>0 required' using errcode = 'invalid_parameter_value';
  end if;
  select * into oi from public.order_items where id = v_oi;
  if not found then raise exception 'confirm_pick: order item % not found', v_oi using errcode = 'foreign_key_violation'; end if;
  v_order := oi.order_id; v_variant := oi.variant_id;
  perform 1 from public.orders where id = v_order for update;
  perform 1 from public.variants where id = v_variant for update;
  if (select tracking_state from public.variants where id = v_variant) <> 'tracked' then
    raise exception 'confirm_pick: variant is not tracked — use the standard pick flow' using errcode = 'check_violation';
  end if;
  v_ent := public.order_item_entitlements(v_order);
  if (v_ent->>'order_blocked')::boolean then
    raise exception 'confirm_pick: order not fulfillable (%)', v_ent->>'block_reason' using errcode = 'check_violation';
  end if;
  select i into v_item from jsonb_array_elements(v_ent->'items') i where (i->>'order_item_id')::uuid = v_oi;
  v_remaining := (v_item->>'remaining_fulfillable')::int;
  select coalesce(sum(qty),0) into v_already from public.batch_pick_confirmations where order_item_id = v_oi;
  if v_already + v_qty > v_remaining then
    raise exception 'confirm_pick: would exceed fulfillable qty (already %, +%, remaining %)', v_already, v_qty, v_remaining using errcode = 'check_violation';
  end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> v_variant then raise exception 'confirm_pick: batch does not match the order item variant' using errcode = 'check_violation'; end if;
  if b.recall_state <> 'none' then raise exception 'confirm_pick: batch is recalled/held — cannot pick' using errcode = 'check_violation'; end if;
  v_fp := public.batch_config_fingerprint(v_batch);
  if not exists (select 1 from public.batch_design_validations where config_fingerprint = v_fp and result='pass' and state='approved') then
    raise exception 'confirm_pick: batch has no approved design validation — ineligible' using errcode = 'check_violation';
  end if;

  -- SUBSTITUTION iff the picked batch is NOT among this line's allocations. Allocations are NEVER mutated;
  -- the substitution is recorded as an immutable event (batch_pick_confirmations) + a movement-less
  -- intra-variant overlay (return units to a displaced allocated batch, consume from the actual batch).
  v_sub := not exists (select 1 from public.batch_allocations where order_item_id = v_oi and component_key = v_comp
                       and batch_id = v_batch and state in ('allocated','picked','shipped'));
  if v_sub then
    if public.batch_onhand(v_batch) < v_qty then
      raise exception 'confirm_pick: substitute batch on-hand % < requested %', public.batch_onhand(v_batch), v_qty using errcode = 'check_violation';
    end if;
    select batch_id into v_alloc_batch from public.batch_allocations
      where order_item_id = v_oi and component_key = v_comp and state in ('allocated','picked','shipped') order by qty desc limit 1;
    if v_alloc_batch is null then raise exception 'confirm_pick: no allocation to substitute against for this line' using errcode = 'check_violation'; end if;
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_alloc_batch, v_variant, 'substitution_in',  v_qty, null, 'order', v_order, coalesce(v_reason,'pick substitution'), v_actor, 'subst_in:'  || v_oi::text || ':' || v_batch::text || ':' || v_already::text);
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_batch, v_variant, 'substitution_out', -v_qty, null, 'order', v_order, coalesce(v_reason,'pick substitution'), v_actor, 'subst_out:' || v_oi::text || ':' || v_batch::text || ':' || v_already::text);
  end if;

  insert into public.batch_pick_confirmations(order_id, order_item_id, variant_id, batch_id, component_key, qty, allocated_batch_id, is_substitution, reason, confirmed_by)
  values (v_order, v_oi, v_variant, v_batch, v_comp, v_qty, v_alloc_batch, v_sub, v_reason, v_actor);
  update public.order_items set picked_qty = least(quantity, coalesce(picked_qty,0) + v_qty) where id = v_oi;

  return jsonb_build_object('ok', true, 'order_item_id', v_oi, 'batch_id', v_batch, 'qty', v_qty, 'substitution', v_sub, 'picked_total', v_already + v_qty);
end $$;

-- ── #5 packing QC carries the pick fingerprint ───────────────────────────────
create or replace function public.record_packing_qc(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order uuid := nullif(p->>'order_id','')::uuid; v_ship uuid := nullif(p->>'shipment_id','')::uuid;
        v_checklist jsonb := p->'checklist'; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_passed boolean;
begin
  if v_order is null or v_checklist is null then raise exception 'packing_qc: order_id and checklist required' using errcode = 'invalid_parameter_value'; end if;
  v_passed := coalesce((v_checklist->>'product_ok')::boolean,false) and coalesce((v_checklist->>'variant_ok')::boolean,false)
          and coalesce((v_checklist->>'batch_ok')::boolean,false) and coalesce((v_checklist->>'qty_ok')::boolean,false)
          and coalesce((v_checklist->>'vessel_ok')::boolean,false) and coalesce((v_checklist->>'label_ok')::boolean,false)
          and coalesce((v_checklist->>'packaging_ok')::boolean,false);
  insert into public.packing_qc_checks(order_id, shipment_id, checklist, passed, operator_id, notes, pick_fingerprint)
  values (v_order, v_ship, v_checklist, v_passed, v_actor, nullif(p->>'notes',''), public.order_pick_fingerprint(v_order));
  return jsonb_build_object('ok', true, 'passed', v_passed, 'pick_fingerprint', public.order_pick_fingerprint(v_order));
end $$;

-- ── #2 dispatch readiness gate for a TRACKED order ───────────────────────────
create or replace function public.assert_tracked_shipment_ready(p_order_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_ent jsonb; it jsonb; v_has_tracked boolean := false; v_fp text; v_qc_ok boolean;
begin
  v_ent := public.order_item_entitlements(p_order_id);
  if (v_ent->>'order_blocked')::boolean then
    return jsonb_build_object('ready', false, 'reason', coalesce(v_ent->>'block_reason','blocked'));
  end if;
  for it in select * from jsonb_array_elements(v_ent->'items') loop
    if (it->>'tracked')::boolean then
      v_has_tracked := true;
      -- full confirmation: every fulfillable unit of the line has a confirmed actual batch
      if (it->>'picked_confirmed')::int <> (it->>'remaining_fulfillable')::int then
        return jsonb_build_object('ready', false, 'reason', 'incomplete_pick_confirmation', 'order_item_id', it->>'order_item_id');
      end if;
    end if;
  end loop;
  if not v_has_tracked then return jsonb_build_object('ready', true, 'tracked', false); end if;  -- untracked: unchanged
  -- every confirmed batch must still be ELIGIBLE right now (no recall/hold slipped in after picking)
  if exists (select 1 from public.batch_pick_confirmations pc join public.manufacturing_batches b on b.id = pc.batch_id
             where pc.order_id = p_order_id and b.recall_state <> 'none') then
    return jsonb_build_object('ready', false, 'reason', 'confirmed_batch_recalled_or_held');
  end if;
  -- a CURRENT passing packing QC (fingerprint must match the current picks — a later pick supersedes it)
  v_fp := public.order_pick_fingerprint(p_order_id);
  select passed into v_qc_ok from public.packing_qc_checks
    where order_id = p_order_id and pick_fingerprint = v_fp order by created_at desc limit 1;
  if not coalesce(v_qc_ok, false) then
    return jsonb_build_object('ready', false, 'reason', 'packing_qc_missing_or_stale');
  end if;
  return jsonb_build_object('ready', true, 'tracked', true);
end $$;

-- ── #2 confirm_shipment_provenance — gated, no allocation mutation, immutable lines ──
create or replace function public.confirm_shipment_provenance(p_shipment_id uuid, p_actor uuid default null)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid; r record; v_count int := 0; v_ready jsonb;
begin
  select order_id into v_order from public.shipments where id = p_shipment_id for update;
  if v_order is null then raise exception 'ship_provenance: shipment % not found', p_shipment_id using errcode = 'foreign_key_violation'; end if;
  if exists (select 1 from public.shipment_batch_lines where shipment_id = p_shipment_id) then
    return jsonb_build_object('ok', true, 'already_frozen', true);  -- immutable once written
  end if;
  v_ready := public.assert_tracked_shipment_ready(v_order);
  if not (v_ready->>'ready')::boolean then
    raise exception 'ship_provenance: order not ready to dispatch (%)', v_ready->>'reason' using errcode = 'check_violation';
  end if;
  for r in
    select pc.order_item_id, pc.variant_id, pc.batch_id, pc.component_key, sum(pc.qty)::int as qty
      from public.batch_pick_confirmations pc where pc.order_id = v_order group by pc.order_item_id, pc.variant_id, pc.batch_id, pc.component_key
  loop
    -- re-check eligibility immediately before this irreversible freeze
    if (select recall_state from public.manufacturing_batches where id = r.batch_id) <> 'none' then
      raise exception 'ship_provenance: batch % became recalled/held', r.batch_id using errcode = 'check_violation';
    end if;
    insert into public.shipment_batch_lines(shipment_id, order_id, order_item_id, variant_id, batch_id, component_key, qty)
    values (p_shipment_id, v_order, r.order_item_id, r.variant_id, r.batch_id, r.component_key, r.qty);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'frozen_lines', v_count);
end $$;

-- ── #1 attribute_receipt_restock — provenance = shipped → picked → allocation ──
create or replace function public.attribute_receipt_restock(
  p_receipt_id uuid, p_receipt_item_id uuid, p_variant uuid, p_order uuid,
  p_movement_type text, p_src_type text, p_src_id uuid, p_reference text, p_actor uuid, p_restockable int)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry text := case p_movement_type when 'rto_restock' then 'rto_restock' else 'return_restock' end;
  v_cand int := 0; v_blocked boolean := false; v_single_blocked uuid;
  vb record; v_cap int; v_take int; v_remaining int := p_restockable; v_attributed int := 0;
  v_bids uuid[] := '{}'; v_bq int[] := '{}'; v_mid uuid; i int; v_key text;
begin
  if p_order is null then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'unknown_origin',
            'no source order resolved for this receipt; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;

  -- Candidate originating batches from ACTUAL provenance (shipped → picked → logical allocation).
  for vb in
    select pr.batch_id as bid, b.recall_state as rs
      from public.order_variant_provenance(p_order, p_variant) pr
      join public.manufacturing_batches b on b.id = pr.batch_id
     group by pr.batch_id, b.recall_state
  loop
    v_cand := v_cand + 1;
    if vb.rs <> 'none' then v_blocked := true; v_single_blocked := vb.bid; end if;
  end loop;

  if v_cand = 0 then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'unknown_origin',
            'no recorded batch provenance for this order/variant; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;
  if v_cand = 1 and v_blocked then
    insert into public.batch_quarantine(batch_id, variant_id, qty, reason, actor_id)
    values (v_single_blocked, p_variant, p_restockable, 'returned units of a recalled/held batch', p_actor);
    return jsonb_build_object('restocked', 0, 'quarantined', p_restockable, 'movement_id', null);
  end if;
  if v_blocked then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'recall_ambiguous',
            'order shipped from multiple batches including a recalled/held one; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;

  for vb in
    select pr.batch_id as bid, pr.qty as shipped,
           coalesce((select sum(bse.qty)::int from public.batch_stock_entries bse
                      where bse.batch_id = pr.batch_id and bse.variant_id = p_variant
                        and bse.source_id = p_order and bse.entry_type in ('return_restock','rto_restock')), 0) as already_ret,
           b.manufacturing_date as mdate, b.production_sequence as pseq
      from public.order_variant_provenance(p_order, p_variant) pr
      join public.manufacturing_batches b on b.id = pr.batch_id
     order by b.manufacturing_date asc, b.production_sequence asc, pr.batch_id asc
  loop
    exit when v_remaining <= 0;
    v_cap := vb.shipped - vb.already_ret;
    if v_cap <= 0 then continue; end if;
    v_take := least(v_remaining, v_cap);
    v_bids := v_bids || vb.bid; v_bq := v_bq || v_take;
    v_remaining := v_remaining - v_take; v_attributed := v_attributed + v_take;
  end loop;

  if v_attributed > 0 then
    v_key := (case p_movement_type when 'rto_restock' then 'rto_receipt_item:' else 'return_receipt_item:' end) || p_receipt_item_id::text;
    perform public.apply_stock_movement(p_variant, v_attributed, p_movement_type, p_src_type, p_src_id,
      p_reference, p_actor, null, null,
      jsonb_build_object('receipt_id', p_receipt_id, 'receipt_item_id', p_receipt_item_id, 'batch_aware', true), v_key);
    v_mid := (select id from public.inventory_movements where idempotency_key = v_key);
    for i in 1 .. array_length(v_bids, 1) loop
      insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
      values (v_bids[i], p_variant, v_entry, v_bq[i], v_mid, 'order', p_order, p_reference, p_actor, 'ret_overlay:' || v_mid::text || ':' || v_bids[i]::text);
    end loop;
    update public.inventory_receipt_items set movement_id = v_mid where id = p_receipt_item_id;
  end if;
  if v_remaining > 0 then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, v_remaining, 'over_provenance',
            'restockable exceeded recorded shipped-minus-returned provenance; manual batch attribution required');
  end if;
  return jsonb_build_object('restocked', v_attributed, 'held', v_remaining, 'movement_id', v_mid);
end $$;

-- ── #6 write-off conservation: never consume more than current batch on-hand ──
create or replace function public.dispose_exception_shortfall(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'exception_id','')::uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  e public.order_inventory_exceptions%rowtype; b public.manufacturing_batches%rowtype;
begin
  if v_id is null or v_batch is null then
    raise exception 'dispose_shortfall: exception_id and batch_id (the batch physically holding the units) required' using errcode = 'invalid_parameter_value';
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
  -- Conservation: cannot write off more than the batch currently physically holds (units already allocated,
  -- shipped or otherwise consumed are no longer in on-hand). Movement-less → aggregate stock untouched.
  if public.batch_onhand(v_batch) < e.shortfall_qty then
    raise exception 'dispose_shortfall: batch on-hand % < write-off qty % (units unavailable)', public.batch_onhand(v_batch), e.shortfall_qty using errcode = 'check_violation';
  end if;
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_batch, e.variant_id, 'writeoff', -e.shortfall_qty, null, 'order', e.order_id,
          coalesce(v_reason, 'refunded shortfall physically written off (synthetic disposition — not verified sale provenance)'),
          v_actor, 'exc_writeoff:' || e.id::text);
  update public.order_inventory_exceptions
     set state = 'resolved_written_off', reason = coalesce(v_reason, reason), resolved_at = pg_catalog.now(), resolved_by = v_actor, updated_at = pg_catalog.now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'written_off', e.shortfall_qty, 'batch_id', v_batch, 'synthetic', true);
end $$;

revoke all on function public.order_pick_fingerprint(uuid)                      from public, anon, authenticated;
revoke all on function public.order_variant_provenance(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.order_item_entitlements(uuid)                     from public, anon, authenticated;
revoke all on function public.confirm_pick_batch(jsonb)                         from public, anon, authenticated;
revoke all on function public.record_packing_qc(jsonb)                          from public, anon, authenticated;
revoke all on function public.assert_tracked_shipment_ready(uuid)               from public, anon, authenticated;
revoke all on function public.confirm_shipment_provenance(uuid, uuid)           from public, anon, authenticated;
revoke all on function public.attribute_receipt_restock(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,int) from public, anon, authenticated;
revoke all on function public.dispose_exception_shortfall(jsonb)                from public, anon, authenticated;
grant  execute on function public.order_pick_fingerprint(uuid)                  to service_role;
grant  execute on function public.order_variant_provenance(uuid, uuid)          to service_role;
grant  execute on function public.order_item_entitlements(uuid)                 to service_role;
grant  execute on function public.confirm_pick_batch(jsonb)                     to service_role;
grant  execute on function public.record_packing_qc(jsonb)                      to service_role;
grant  execute on function public.assert_tracked_shipment_ready(uuid)           to service_role;
grant  execute on function public.confirm_shipment_provenance(uuid, uuid)       to service_role;
grant  execute on function public.attribute_receipt_restock(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,int) to service_role;
grant  execute on function public.dispose_exception_shortfall(jsonb)            to service_role;
