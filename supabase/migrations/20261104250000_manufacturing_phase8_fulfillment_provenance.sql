-- ============================================================================
-- MANUFACTURING — Phase 8: physical batch picking, packing & shipment traceability
-- ============================================================================
-- INERT for untracked commerce (every current variant is untracked → these paths are not exercised
-- by normal fulfilment, which keeps using order_items.picked_qty). ADDITIVE. apply_stock_movement
-- UNCHANGED. variants.stock is NEVER changed by any Phase 8 operation (substitution is intra-variant
-- batch reassignment only). DO NOT activate tracking or push/deploy.
--
-- Adds, per the existing fulfilment machine (reserved→picking→…→shipped) and the one-shipment-per-order
-- model:
--   • order_item_entitlements(order)  — the server-side quantity truth per line (A.2 / B.4): ordered,
--     allocated, picked-confirmed, shipped, line-identifiable refunded, remaining fulfillable, + a block
--     flag (open exception / cancelled / fully-refunded / AMBIGUOUS partial refund).
--   • batch_pick_confirmations (append-only) + confirm_pick_batch — operator confirms the ACTUAL batch of
--     each picked unit (B.2); a physical batch ≠ the payment-time allocation is a controlled, audited
--     SUBSTITUTION (B.3) done with movement-less substitution_in/out overlay (aggregate stock untouched,
--     per-batch non-negative, no double consumption).
--   • shipment_batch_lines (immutable) + confirm_shipment_provenance — freeze the confirmed batch qtys per
--     shipment line (B.6); enables batch⇄order⇄shipment reverse traceability.
--   • packing_qc_checks — routine packing QC, separate from manufacturing QC (B.5).
-- Returns (B.7): attribute_receipt_restock now prefers CONFIRMED shipment/pick provenance over the
-- logical allocation, falling back to allocations, and still holding on ambiguity.
-- ============================================================================

-- ── B.2 actual-pick provenance (append-only) ─────────────────────────────────
create table if not exists public.batch_pick_confirmations (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete restrict,
  order_item_id      uuid not null references public.order_items(id) on delete restrict,
  variant_id         uuid not null references public.variants(id) on delete restrict,
  batch_id           uuid not null references public.manufacturing_batches(id) on delete restrict,  -- ACTUAL physical batch
  component_key      text not null default '',                                                      -- bundle component provenance
  qty                integer not null check (qty > 0),
  allocated_batch_id uuid references public.manufacturing_batches(id) on delete set null,           -- the payment-time allocation (audit)
  is_substitution    boolean not null default false,
  reason             text,
  confirmed_by       uuid references public.users(id) on delete set null,
  confirmed_at       timestamptz not null default now()
);
create index if not exists bpc_order_item_idx on public.batch_pick_confirmations(order_item_id);
create index if not exists bpc_batch_idx on public.batch_pick_confirmations(batch_id);
alter table public.batch_pick_confirmations enable row level security;
grant select, insert on public.batch_pick_confirmations to service_role;   -- append-only

-- ── B.6 shipment provenance (immutable once written) ─────────────────────────
create table if not exists public.shipment_batch_lines (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references public.shipments(id) on delete restrict,
  order_id      uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  variant_id    uuid not null references public.variants(id) on delete restrict,
  batch_id      uuid not null references public.manufacturing_batches(id) on delete restrict,
  component_key text not null default '',
  qty           integer not null check (qty > 0),
  created_at    timestamptz not null default now(),
  unique (shipment_id, order_item_id, batch_id, component_key)
);
create index if not exists sbl_shipment_idx on public.shipment_batch_lines(shipment_id);
create index if not exists sbl_batch_idx on public.shipment_batch_lines(batch_id);
alter table public.shipment_batch_lines enable row level security;
grant select, insert on public.shipment_batch_lines to service_role;       -- append-only (immutable)

-- ── B.5 packing QC (separate from manufacturing/burn QC) ─────────────────────
create table if not exists public.packing_qc_checks (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete restrict,
  shipment_id  uuid references public.shipments(id) on delete set null,
  checklist    jsonb not null,            -- {product_ok,variant_ok,batch_ok,qty_ok,vessel_ok,label_ok,packaging_ok}
  passed       boolean not null,
  operator_id  uuid references public.users(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists pqc_order_idx on public.packing_qc_checks(order_id);
alter table public.packing_qc_checks enable row level security;
grant select, insert on public.packing_qc_checks to service_role;

-- ── A.2 / B.4 entitlement truth — per order item, server-authoritative ───────
create or replace function public.order_item_entitlements(p_order_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with o as (select status, payment_status, total_amount, coalesce(refund_amount,0) as refund_amount from public.orders where id = p_order_id),
  exc as (select exists(select 1 from public.order_inventory_exceptions
            where order_id = p_order_id and state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated')) as open_exc),
  -- A partial monetary refund whose quantity is NOT line-identifiable (no covering return_items) is AMBIGUOUS.
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
      coalesce((select sum(pc.qty) from public.batch_pick_confirmations pc where pc.order_item_id = oi.id),0)::int as picked_confirmed,
      coalesce((select sum(sl.qty) from public.shipment_batch_lines sl where sl.order_item_id = oi.id),0)::int as shipped,
      coalesce((select refunded_identifiable from refl where refl.order_item_id = oi.id),0)::int as refunded_identifiable,
      coalesce(oi.picked_qty,0) as picked_qty
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
        'order_item_id', id, 'variant_id', variant_id, 'is_bundle', is_bundle,
        'ordered', ordered, 'allocated', allocated, 'picked_qty', picked_qty,
        'picked_confirmed', picked_confirmed, 'shipped', shipped,
        'refunded_identifiable', refunded_identifiable,
        'remaining_fulfillable', greatest(0, ordered - shipped - refunded_identifiable)
      )) from items), '[]'::jsonb)
  );
$$;

-- ── B.2/B.3/B.4 confirm the ACTUAL picked batch (with controlled substitution) ──
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
  v_ent jsonb; v_item jsonb; v_remaining int; v_already int; v_alloc_batch uuid; v_alloc_qty int; v_sub boolean := false; v_fp text;
begin
  if v_oi is null or v_batch is null or v_qty is null or v_qty <= 0 then
    raise exception 'confirm_pick: order_item_id, batch_id, qty>0 required' using errcode = 'invalid_parameter_value';
  end if;
  select * into oi from public.order_items where id = v_oi;
  if not found then raise exception 'confirm_pick: order item % not found', v_oi using errcode = 'foreign_key_violation'; end if;
  v_order := oi.order_id; v_variant := oi.variant_id;
  -- Lock order → variant → batch (deterministic order).
  perform 1 from public.orders where id = v_order for update;
  perform 1 from public.variants where id = v_variant for update;
  -- Only meaningful for a tracked variant; untracked fulfilment uses order_items.picked_qty directly.
  if (select tracking_state from public.variants where id = v_variant) <> 'tracked' then
    raise exception 'confirm_pick: variant is not tracked — use the standard pick flow' using errcode = 'check_violation';
  end if;
  -- Entitlement + global fulfilment block (refunded/cancelled/exception/ambiguous).
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
  -- Batch must belong to the variant and be ELIGIBLE (not recalled/held; approved design validation).
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> v_variant then raise exception 'confirm_pick: batch does not match the order item variant' using errcode = 'check_violation'; end if;
  if b.recall_state <> 'none' then raise exception 'confirm_pick: batch is recalled/held — cannot pick' using errcode = 'check_violation'; end if;
  v_fp := public.batch_config_fingerprint(v_batch);
  if not exists (select 1 from public.batch_design_validations where config_fingerprint = v_fp and result='pass' and state='approved') then
    raise exception 'confirm_pick: batch has no approved design validation — ineligible' using errcode = 'check_violation';
  end if;
  -- SUBSTITUTION iff the picked batch is NOT among this line's allocations (mixed-batch allocations are
  -- all legitimate, so confirming any allocated batch is NOT a substitution). An ALLOCATED batch already had
  -- its units committed (sale overlay) at sale time, so its on-hand is expected to be 0 here — the on-hand
  -- check applies ONLY to a substitute batch, which must physically hold the units it now gives up.
  v_sub := not exists (select 1 from public.batch_allocations where order_item_id = v_oi and component_key = v_comp
                       and batch_id = v_batch and state in ('allocated','picked','shipped'));

  if v_sub then
    if public.batch_onhand(v_batch) < v_qty then
      raise exception 'confirm_pick: substitute batch on-hand % < requested %', public.batch_onhand(v_batch), v_qty using errcode = 'check_violation';
    end if;
    -- Displace an allocated batch (prefer one still 'allocated' with qty to spare) to return the units to.
    select batch_id into v_alloc_batch from public.batch_allocations
      where order_item_id = v_oi and component_key = v_comp and state = 'allocated' and qty > 0 order by qty desc limit 1;
    if v_alloc_batch is null then
      select batch_id into v_alloc_batch from public.batch_allocations
        where order_item_id = v_oi and component_key = v_comp order by qty desc limit 1;
    end if;
    if v_alloc_batch is null then
      raise exception 'confirm_pick: no allocation to substitute against for this line' using errcode = 'check_violation';
    end if;
    -- Controlled substitution (intra-variant): logically return v_qty to the displaced allocated batch and
    -- consume from the ACTUAL batch, via MOVEMENT-LESS substitution overlay. variants.stock is untouched;
    -- per-batch non-negativity is enforced by trigger; the attribution drift is unchanged (movement-less).
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_alloc_batch, v_variant, 'substitution_in',  v_qty, null, 'order', v_order, coalesce(v_reason,'pick substitution'), v_actor, 'subst_in:'  || v_oi::text || ':' || v_batch::text || ':' || v_already::text);
    insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
    values (v_batch, v_variant, 'substitution_out', -v_qty, null, 'order', v_order, coalesce(v_reason,'pick substitution'), v_actor, 'subst_out:' || v_oi::text || ':' || v_batch::text || ':' || v_already::text);
    -- Re-point provenance: reduce (or remove, since qty must stay > 0) the displaced allocation,
    -- then add/extend an allocation to the ACTUAL batch.
    delete from public.batch_allocations where order_item_id = v_oi and batch_id = v_alloc_batch and component_key = v_comp and qty <= v_qty;
    update public.batch_allocations set qty = qty - v_qty, state = 'picked'
      where order_item_id = v_oi and batch_id = v_alloc_batch and component_key = v_comp and qty > v_qty;
    insert into public.batch_allocations(order_id, order_item_id, variant_id, component_key, batch_id, qty, state)
    values (v_order, v_oi, v_variant, v_comp, v_batch, v_qty, 'picked')
      on conflict (order_item_id, variant_id, batch_id, component_key) do update set qty = public.batch_allocations.qty + excluded.qty, state = 'picked';
  else
    update public.batch_allocations set state = 'picked' where order_item_id = v_oi and batch_id = v_batch and component_key = v_comp and state in ('allocated');
  end if;

  insert into public.batch_pick_confirmations(order_id, order_item_id, variant_id, batch_id, component_key, qty, allocated_batch_id, is_substitution, reason, confirmed_by)
  values (v_order, v_oi, v_variant, v_batch, v_comp, v_qty, v_alloc_batch, v_sub, v_reason, v_actor);
  update public.order_items set picked_qty = least(quantity, coalesce(picked_qty,0) + v_qty) where id = v_oi;

  return jsonb_build_object('ok', true, 'order_item_id', v_oi, 'batch_id', v_batch, 'qty', v_qty, 'substitution', v_sub, 'picked_total', v_already + v_qty);
end $$;

-- ── B.6 freeze shipment provenance from confirmed picks (idempotent) ─────────
create or replace function public.confirm_shipment_provenance(p_shipment_id uuid, p_actor uuid default null)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid; r record; v_count int := 0;
begin
  select order_id into v_order from public.shipments where id = p_shipment_id for update;
  if v_order is null then raise exception 'ship_provenance: shipment % not found', p_shipment_id using errcode = 'foreign_key_violation'; end if;
  if exists (select 1 from public.shipment_batch_lines where shipment_id = p_shipment_id) then
    return jsonb_build_object('ok', true, 'already_frozen', true);  -- immutable once written
  end if;
  for r in
    select order_item_id, variant_id, batch_id, component_key, sum(qty)::int as qty
      from public.batch_pick_confirmations where order_id = v_order group by order_item_id, variant_id, batch_id, component_key
  loop
    insert into public.shipment_batch_lines(shipment_id, order_id, order_item_id, variant_id, batch_id, component_key, qty)
    values (p_shipment_id, v_order, r.order_item_id, r.variant_id, r.batch_id, r.component_key, r.qty);
    update public.batch_allocations set state = 'shipped' where order_item_id = r.order_item_id and batch_id = r.batch_id and component_key = r.component_key and state in ('allocated','picked');
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'frozen_lines', v_count);
end $$;

-- ── B.5 record packing QC ────────────────────────────────────────────────────
create or replace function public.record_packing_qc(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid := nullif(p->>'order_id','')::uuid; v_ship uuid := nullif(p->>'shipment_id','')::uuid;
        v_checklist jsonb := p->'checklist'; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_passed boolean;
begin
  if v_order is null or v_checklist is null then raise exception 'packing_qc: order_id and checklist required' using errcode = 'invalid_parameter_value'; end if;
  v_passed := coalesce((v_checklist->>'product_ok')::boolean,false) and coalesce((v_checklist->>'variant_ok')::boolean,false)
          and coalesce((v_checklist->>'batch_ok')::boolean,false) and coalesce((v_checklist->>'qty_ok')::boolean,false)
          and coalesce((v_checklist->>'vessel_ok')::boolean,false) and coalesce((v_checklist->>'label_ok')::boolean,false)
          and coalesce((v_checklist->>'packaging_ok')::boolean,false);
  insert into public.packing_qc_checks(order_id, shipment_id, checklist, passed, operator_id, notes)
  values (v_order, v_ship, v_checklist, v_passed, v_actor, nullif(p->>'notes',''));
  return jsonb_build_object('ok', true, 'passed', v_passed);
end $$;

revoke all on function public.order_item_entitlements(uuid)              from public, anon, authenticated;
revoke all on function public.confirm_pick_batch(jsonb)                  from public, anon, authenticated;
revoke all on function public.confirm_shipment_provenance(uuid, uuid)    from public, anon, authenticated;
revoke all on function public.record_packing_qc(jsonb)                   from public, anon, authenticated;
grant  execute on function public.order_item_entitlements(uuid)          to service_role;
grant  execute on function public.confirm_pick_batch(jsonb)              to service_role;
grant  execute on function public.confirm_shipment_provenance(uuid, uuid) to service_role;
grant  execute on function public.record_packing_qc(jsonb)               to service_role;
