-- ============================================================================
-- MANUFACTURING — Phase 7A: batch-aware sale accounting (INERT, ADDITIVE)
-- ============================================================================
-- Adds allocate_order_batches and wires it into finalize_order behind two gates that
-- are BOTH disabled by default: allocation_enabled=false AND variant.tracking_state must
-- be 'tracked' (no live variant is). For untracked variants / disabled allocation the
-- sale path is BYTE-IDENTICAL to before: finalize_order still posts exactly one untagged
-- 'sale' movement per variant via apply_stock_movement; NO double deduction; idempotency
-- and the terminal guard are preserved verbatim. No live sellable stock changes.
--
-- Part-A hardening folded in: both switches now DEFAULT disabled; release_batch locks the
-- variant BEFORE the batch (canonical order: orders → variants → batches) and takes a
-- FOR SHARE lock on the design validation so a concurrent revoke serialises.
-- DO NOT apply to production without approval. DO NOT enable allocation or tracking.
-- ============================================================================

-- ── Part A: both switches default disabled (fail-closed) ─────────────────────
alter table public.manufacturing_settings alter column release_enabled set default false;
update public.manufacturing_settings set release_enabled = false, updated_at = now() where id = true;

-- Activation needs to write the tracking columns. inventory_authority granted service_role
-- COLUMN-level UPDATE on variants (to keep `stock` write-protected via apply_stock_movement);
-- the later tracking columns aren't in that list, so grant them explicitly. `stock` stays revoked.
grant update (tracking_state, tracked_at) on public.variants to service_role;

-- ── Part A: release_batch — variant-first lock order + FOR SHARE on validation ─
create or replace function public.release_batch(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid := nullif(p->>'batch_id','')::uuid; v_qty int := (p->>'qty')::int;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_idem text := nullif(p->>'idempotency_key','');
  b public.manufacturing_batches%rowtype; ev public.batch_release_events%rowtype;
  v_variant uuid; v_released int; v_seq int; v_enabled boolean; v_tracking text; v_fp text; v_event_id uuid; v_mid uuid; v_seid uuid;
begin
  if v_batch_id is null or v_qty is null then raise exception 'release_batch: batch_id and qty required' using errcode = 'invalid_parameter_value'; end if;

  if v_idem is not null then
    select * into ev from public.batch_release_events where idempotency_key = v_idem;
    if found then
      if ev.batch_id <> v_batch_id or ev.qty <> v_qty then
        raise exception 'release_batch: idempotency key % reused with different input', v_idem using errcode = 'unique_violation';
      end if;
      return jsonb_build_object('ok', true, 'idempotent', true, 'event_id', ev.id, 'movement_id', ev.movement_id, 'released_qty', ev.qty);
    end if;
  end if;

  -- Canonical lock order: variant row BEFORE batch row (matches finalize/allocation).
  select variant_id into v_variant from public.manufacturing_batches where id = v_batch_id;
  if v_variant is null then raise exception 'release_batch: batch % not found', v_batch_id using errcode = 'foreign_key_violation'; end if;
  perform 1 from public.variants where id = v_variant for update;
  select * into b from public.manufacturing_batches where id = v_batch_id for update;

  select release_enabled into v_enabled from public.manufacturing_settings where id = true;
  if not coalesce(v_enabled, false) then raise exception 'release_batch: releases are disabled' using errcode = 'check_violation'; end if;
  select tracking_state into v_tracking from public.variants where id = b.variant_id;
  if v_tracking <> 'tracked' then raise exception 'release_batch: variant is % — batch release is inert until tracked', v_tracking using errcode = 'check_violation'; end if;
  if b.lifecycle_status <> 'qc_approved' then raise exception 'release_batch: batch is % (needs qc_approved)', b.lifecycle_status using errcode = 'check_violation'; end if;
  if b.recall_state <> 'none' then raise exception 'release_batch: batch is on hold/recalled' using errcode = 'check_violation'; end if;
  if b.approved_at is null then raise exception 'release_batch: no current QC approval' using errcode = 'check_violation'; end if;

  v_fp := public.batch_config_fingerprint(v_batch_id);
  -- FOR SHARE: a concurrent revoke_design_validation (UPDATE) serialises behind this lock.
  perform 1 from public.batch_design_validations where config_fingerprint = v_fp and result = 'pass' and state = 'approved' for share;
  if not found then raise exception 'release_batch: an approved design validation for the current configuration is required' using errcode = 'check_violation'; end if;

  if v_qty <= 0 then raise exception 'release_batch: qty must be > 0' using errcode = 'invalid_parameter_value'; end if;
  select coalesce(sum(qty), 0) into v_released from public.batch_release_events where batch_id = v_batch_id;
  if v_released + v_qty > b.approved_qty then
    raise exception 'release_batch: releasing % would exceed approved % (already released %)', v_qty, b.approved_qty, v_released using errcode = 'check_violation';
  end if;

  select coalesce(max(release_seq), 0) + 1 into v_seq from public.batch_release_events where batch_id = v_batch_id;
  insert into public.batch_release_events(batch_id, release_seq, qty, idempotency_key, released_by, qc_revision)
  values (v_batch_id, v_seq, v_qty, v_idem, v_actor, b.qc_revision) returning id into v_event_id;

  perform public.apply_stock_movement(b.variant_id, v_qty, 'batch_release', 'batch', v_batch_id, b.batch_code, v_actor, null, null, jsonb_build_object('release_event_id', v_event_id), 'batch_release:' || v_event_id::text);
  v_mid := (select id from public.inventory_movements where idempotency_key = 'batch_release:' || v_event_id::text);
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, metadata, idempotency_key)
  values (v_batch_id, b.variant_id, 'release', v_qty, v_mid, 'batch', v_batch_id, b.batch_code, v_actor, jsonb_build_object('release_event_id', v_event_id), 'rel_overlay:' || v_event_id::text) returning id into v_seid;
  update public.batch_release_events set movement_id = v_mid, stock_entry_id = v_seid where id = v_event_id;
  if (select coalesce(sum(qty), 0) from public.batch_stock_entries where movement_id = v_mid) <> v_qty then
    raise exception 'release_batch: overlay/movement reconciliation mismatch' using errcode = 'check_violation';
  end if;
  return jsonb_build_object('ok', true, 'created', true, 'event_id', v_event_id, 'movement_id', v_mid,
                            'released_qty', v_qty, 'total_released', v_released + v_qty, 'approved_qty', b.approved_qty);
end $$;

-- ── Part B: allocate_order_batches — FIFO attribution for TRACKED variants ────
-- Posts NO new aggregate stock movement (finalize already posted the authoritative 'sale');
-- it records per-batch overlay (−qty, referencing that movement) + order-item provenance.
-- Only acts when allocation_enabled AND the variant is tracked; otherwise a no-op. Batches
-- are locked FOR UPDATE in FIFO order (variant already locked by finalize) → serialised,
-- never over-allocated. A shortfall is logged as an explicit exception, never invented.
create or replace function public.allocate_order_batches(p_order_id uuid, p_actor uuid)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean; v_ordernum text; r record; v_remaining int; vb record; v_take int;
  v_bids uuid[]; v_bq int[]; v_oiids uuid[]; v_oiq int[]; i int; j int; v_slice int; v_shorts jsonb := '[]'::jsonb;
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

    -- Order-item (bundle-component) provenance: two-pointer over batch slices × this variant's order items.
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
      -- Fail SAFE: never invent an allocation. Record an explicit, auditable inventory exception
      -- (payment is already captured; the ops reconciliation/refund workflow resolves the shortfall).
      v_shorts := v_shorts || jsonb_build_object('variant_id', r.variant_id, 'shortfall', v_remaining);
      insert into public.audit_logs(action, entity_type, entity_id, after_data)
      values ('inventory.allocation_shortfall', 'order', p_order_id, jsonb_build_object('variant_id', r.variant_id, 'shortfall', v_remaining));
    end if;
  end loop;
  return jsonb_build_object('allocated', true, 'shortfalls', v_shorts);
end $$;

-- ── Part B: finalize_order — VERBATIM body + ONE gated allocation call ────────
-- Reproduced exactly from 20260818120000 (keeping set search_path=public), adding only the
-- perform public.allocate_order_batches(...) after the sale loop. No other behaviour changes.
create or replace function public.finalize_order(
  p_razorpay_order_id text, p_payment_id text, p_signature text, p_source text, p_amount_paise integer default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare o public.orders%rowtype; v_fy text; v_seq integer; v_invoice text; r record;
begin
  select * into o from public.orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if o.idempotency_key is not null then
    return jsonb_build_object('found', true, 'created', false,
      'order_number', o.order_number, 'invoice_number', o.invoice_number, 'email', o.email);
  end if;

  if o.status <> 'pending' then
    return jsonb_build_object('found', true, 'created', false, 'terminal', true,
      'status', o.status::text, 'order_id', o.id, 'order_number', o.order_number,
      'total_amount', o.total_amount, 'email', o.email, 'razorpay_payment_id', p_payment_id);
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
    payment_status = 'paid', status = 'confirmed', razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature, idempotency_key = p_payment_id,
    invoice_number = v_invoice, invoice_date = current_date, updated_at = now()
  where id = o.id;

  for r in select variant_id, sum(quantity)::int as quantity
             from public.stock_reservations where order_id = o.id group by variant_id loop
    perform public.apply_stock_movement(
      r.variant_id, -r.quantity, 'sale', 'order', o.id, o.order_number,
      null, null, null, jsonb_build_object('payment_id', p_payment_id),
      'sale:' || o.id::text || ':' || r.variant_id::text);
  end loop;

  -- Phase 7A (gated/inert): attribute the just-posted 'sale' movements to batches for TRACKED
  -- variants. No-op when allocation_enabled=false or no variant is tracked. Posts no new
  -- aggregate movement, so there is no double deduction.
  perform public.allocate_order_batches(o.id, null);

  delete from public.stock_reservations where order_id = o.id;

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('order_paid', 'order', o.id,
          jsonb_build_object('source', p_source, 'payment_id', p_payment_id, 'invoice_number', v_invoice));

  return jsonb_build_object('found', true, 'created', true, 'source', p_source,
    'order_id', o.id, 'order_number', o.order_number, 'invoice_number', v_invoice, 'email', o.email);
end $$;

-- ── Part B.5: fail-closed guard for not-yet-batch-aware stock writers ────────
-- For a TRACKED variant, cancel/return/RTO restock and manual adjustment are not batch-aware
-- until later phases, so they must FAIL CLOSED rather than post an untagged movement that would
-- corrupt the batch overlay. 'sale' (attributed by allocate_order_batches) and 'batch_release'
-- (attributed in-txn) are exempt. UNTRACKED variants (all production today) are unaffected — this
-- is an additive guard, NOT a change to apply_stock_movement or the caller functions.
create or replace function public.tg_tracked_variant_movement_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.movement_type in ('cancel_restock','return_restock','rto_restock','manual_adjustment')
     and (select tracking_state from public.variants where id = new.variant_ref) = 'tracked' then
    raise exception 'inventory: % on a tracked variant is not batch-aware yet — operation fails closed', new.movement_type
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_tracked_variant_movement_guard on public.inventory_movements;
create trigger trg_tracked_variant_movement_guard before insert on public.inventory_movements
  for each row execute function public.tg_tracked_variant_movement_guard();

revoke all on function public.release_batch(jsonb)                              from public, anon, authenticated;
revoke all on function public.allocate_order_batches(uuid, uuid)                from public, anon, authenticated;
revoke all on function public.finalize_order(text, text, text, text, integer)   from public, anon, authenticated;
grant  execute on function public.release_batch(jsonb)                          to service_role;
grant  execute on function public.allocate_order_batches(uuid, uuid)            to service_role;
grant  execute on function public.finalize_order(text, text, text, text, integer) to service_role;
