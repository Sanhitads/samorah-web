-- Phase 12A — minimum-viable legacy opening-stock accounting (NO new ledger).
--
-- Records a tracked variant's opening classification at the cutover, reusing the existing primitives:
--   • typed `legacy`/`quarantine` batch containers (NO invented manufacturing_date / batch_code / supplier
--     lot / QC history — legacy stock is sellable by the operator SIGN-OFF, not a fabricated design validation),
--   • movement-LESS `legacy_opening` overlay entries (like write-offs) so the batch overlay sums to the
--     authoritative variants.stock (physical_consistent) WITHOUT a parallel ledger,
--   • the `variant_legacy_reconciliation` human sign-off (now carrying quarantine/unknown quantities).
--
-- RELATIONSHIP (authoritative): variants.stock = eligible + quarantine + unknown. variants.stock stays the
-- single aggregate; the opening overlay only *attributes* that aggregate to containers. Eligible → a `legacy`
-- batch that allocation may sell; quarantine + unknown → `quarantine` containers that are NEVER sellable.
-- Pre-existing paid orders already reduced variants.stock (pre-epoch, exempt); pending orders/reservations
-- attribute normally when they finalise AFTER the epoch.

-- 1. Sign-off carries the full classification (additive columns).
alter table public.variant_legacy_reconciliation add column if not exists quarantine_qty integer not null default 0;
alter table public.variant_legacy_reconciliation add column if not exists unknown_qty    integer not null default 0;

-- 2. The cutover RPC: classify + seed opening overlay + record the sign-off, atomically. Idempotent.
create or replace function public.reconcile_variant_opening(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_variant uuid := nullif(p->>'variant_id','')::uuid;
  v_elig int := coalesce((p->>'eligible_qty')::int, 0);
  v_quar int := coalesce((p->>'quarantine_qty')::int, 0);
  v_unk  int := coalesce((p->>'unknown_qty')::int, 0);
  v_actor uuid := nullif(p->>'actor_id','')::uuid;
  v_stock int; v_sku text; v_product uuid; v_track text;
  v_lb uuid; v_qb uuid; v_ub uuid; v_short text;
begin
  if v_variant is null then raise exception 'reconcile_variant_opening: variant_id required' using errcode='invalid_parameter_value'; end if;
  if v_actor is null then raise exception 'reconcile_variant_opening: actor_id (authorisation) required' using errcode='check_violation'; end if;
  if v_elig < 0 or v_quar < 0 or v_unk < 0 then raise exception 'reconcile_variant_opening: quantities must be >= 0' using errcode='check_violation'; end if;

  perform 1 from public.variants where id = v_variant for update;             -- serialise the cutover boundary
  select stock, sku, product_id, tracking_state into v_stock, v_sku, v_product, v_track
    from public.variants where id = v_variant;
  if not found then raise exception 'reconcile_variant_opening: variant % not found', v_variant using errcode='no_data_found'; end if;
  if v_track = 'tracked' then raise exception 'reconcile_variant_opening: variant is already tracked (opening is pre-activation only)' using errcode='check_violation'; end if;
  if v_stock <= 0 then raise exception 'reconcile_variant_opening: no opening stock to reconcile (activate an empty variant directly)' using errcode='check_violation'; end if;

  -- Idempotent: an opening already exists → return it unchanged.
  if exists (select 1 from public.manufacturing_batches where variant_id = v_variant and batch_kind = 'legacy') then
    return jsonb_build_object('ok', true, 'already_opened', true, 'variant_id', v_variant);
  end if;

  -- AUTHORITATIVE RELATIONSHIP: the classified physical MUST equal the aggregate ledger balance.
  if (v_elig + v_quar + v_unk) <> v_stock then
    raise exception 'reconcile_variant_opening: eligible(%)+quarantine(%)+unknown(%) must equal variants.stock(%) — classify the full physical count, invent nothing', v_elig, v_quar, v_unk, v_stock using errcode='check_violation';
  end if;

  v_short := upper(left(replace(v_variant::text,'-',''), 10));

  -- Eligible → a typed LEGACY container (sellable via the sign-off). No invented production identity.
  -- QC counters stay 0 (qty conservation: produced = approved+rejected+sampled+pending); on-hand is the overlay.
  if v_elig > 0 then
    insert into public.manufacturing_batches(variant_id, product_id, batch_kind, lifecycle_status, batch_code, sku_snapshot, planned_qty, produced_qty, approved_qty)
    values (v_variant, v_product, 'legacy', 'released', 'LEGACY-'||v_short, coalesce(v_sku,'LEGACY'), 0, 0, 0) returning id into v_lb;
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_lb, v_variant, 'legacy_opening', v_elig, null, 'system', v_variant, 'legacy opening: verified sellable', v_actor, 'legacy_open_elig:'||v_variant::text);
  end if;
  -- Quarantine → a typed QUARANTINE container (never sellable). Draft lifecycle = never allocation-eligible.
  if v_quar > 0 then
    insert into public.manufacturing_batches(variant_id, product_id, batch_kind, lifecycle_status, batch_code, sku_snapshot, planned_qty, produced_qty, approved_qty)
    values (v_variant, v_product, 'quarantine', 'draft', 'QUAR-'||v_short, coalesce(v_sku,'QUAR'), 0, 0, 0) returning id into v_qb;
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_qb, v_variant, 'legacy_opening', v_quar, null, 'system', v_variant, 'legacy opening: quarantined (not sellable)', v_actor, 'legacy_open_quar:'||v_variant::text);
  end if;
  -- Unknown-origin → a separate QUARANTINE container (held, NOT assumed sellable, NO invented provenance).
  if v_unk > 0 then
    insert into public.manufacturing_batches(variant_id, product_id, batch_kind, lifecycle_status, batch_code, sku_snapshot, planned_qty, produced_qty, approved_qty)
    values (v_variant, v_product, 'quarantine', 'draft', 'UNK-'||v_short, coalesce(v_sku,'UNK'), 0, 0, 0) returning id into v_ub;
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_ub, v_variant, 'legacy_opening', v_unk, null, 'system', v_variant, 'legacy opening: unknown origin (not sellable)', v_actor, 'legacy_open_unk:'||v_variant::text);
  end if;

  -- Human sign-off (makes activation_eligible true once drift is 0 and the overlay sums to stock).
  insert into public.variant_legacy_reconciliation(variant_id, verified_eligible_qty, quarantine_qty, unknown_qty, state, reconciled_by, reconciled_at)
  values (v_variant, v_elig, v_quar, v_unk, 'reconciled', v_actor, pg_catalog.now())
  on conflict (variant_id) do update set verified_eligible_qty = excluded.verified_eligible_qty,
    quarantine_qty = excluded.quarantine_qty, unknown_qty = excluded.unknown_qty, state = 'reconciled',
    reconciled_by = excluded.reconciled_by, reconciled_at = excluded.reconciled_at;

  return jsonb_build_object('ok', true, 'variant_id', v_variant, 'stock', v_stock,
    'eligible', v_elig, 'quarantine', v_quar, 'unknown', v_unk, 'legacy_batch', v_lb);
end $$;

revoke all on function public.reconcile_variant_opening(jsonb) from public, anon, authenticated;
grant  execute on function public.reconcile_variant_opening(jsonb) to service_role;

-- 3. Make eligible LEGACY stock sellable: extend the allocation eligibility predicate (the ONLY hot-path
--    change). A batch is eligible if it has an approved design validation (production, unchanged) OR it is a
--    `legacy` batch whose variant carries an approved reconciliation sign-off. Quarantine containers never match.
create or replace function public.allocate_order_batches(p_order_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
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
        and (
          exists (select 1 from public.batch_design_validations dv
                   where dv.config_fingerprint = public.batch_config_fingerprint(b.id) and dv.result = 'pass' and dv.state = 'approved')
          or (b.batch_kind = 'legacy'
              and exists (select 1 from public.variant_legacy_reconciliation lr
                           where lr.variant_id = b.variant_id and lr.state = 'reconciled'))
        )
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
      insert into public.order_inventory_exceptions(order_id, variant_id, movement_id, shortfall_qty, reason)
      values (p_order_id, r.variant_id, r.movement_id, v_remaining, 'insufficient eligible batch stock at finalisation')
      on conflict (order_id, variant_id) do nothing;
      insert into public.audit_logs(action, entity_type, entity_id, after_data)
      values ('inventory.allocation_exception', 'order', p_order_id, jsonb_build_object('variant_id', r.variant_id, 'shortfall', v_remaining));
      v_exceptions := v_exceptions + 1;
    end if;
  end loop;
  return jsonb_build_object('allocated', true, 'exceptions', v_exceptions);
end $function$;

revoke all on function public.allocate_order_batches(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.allocate_order_batches(uuid, uuid) to service_role;

-- 4. Same eligibility extension for the exception reallocation path.
create or replace function public.reallocate_order_exception(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
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
      and (
        exists (select 1 from public.batch_design_validations dv where dv.config_fingerprint = public.batch_config_fingerprint(b.id) and dv.result='pass' and dv.state='approved')
        or (b.batch_kind = 'legacy'
            and exists (select 1 from public.variant_legacy_reconciliation lr where lr.variant_id = b.variant_id and lr.state = 'reconciled'))
      )
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
end $function$;

revoke all on function public.reallocate_order_exception(jsonb) from public, anon, authenticated;
grant  execute on function public.reallocate_order_exception(jsonb) to service_role;
