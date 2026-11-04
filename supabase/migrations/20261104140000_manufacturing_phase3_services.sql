-- ============================================================================
-- MANUFACTURING — Phase 3: identity, production records & material traceability
-- ============================================================================
-- Server-side RPCs for batch CREATE/EDIT (draft + in_production only), production
-- timestamps, candle spec, and material/supplier-lot traceability. ADDITIVE.
--
-- STRICT: NOTHING here moves stock. No call touches variants.stock, inventory_movements,
-- reservations, finalize_order, fulfillment, returns, or batch release/allocation.
-- Batches created here are 'draft'/'in_production' only — never 'released'.
--
-- Conventions: SECURITY DEFINER, search_path='', fully public.-qualified refs,
-- pg_catalog.now(); revoke from public/anon/authenticated; grant execute to service_role.
-- Actor identity (p->>'actor_id') is supplied by the server (requireCapability), never
-- by the client. DO NOT apply to production without separate approval.
-- ============================================================================

-- ── create_batch — atomic code generation + draft record, idempotent ─────────
create or replace function public.create_batch(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant_id uuid := nullif(p->>'variant_id','')::uuid;
  v_idem       text := nullif(p->>'idempotency_key','');
  v_actor      uuid := nullif(p->>'actor_id','')::uuid;
  v_planned    int  := coalesce((p->>'planned_qty')::int, 0);
  v_date       date := coalesce(nullif(p->>'manufacturing_date','')::date, (pg_catalog.now() at time zone 'Asia/Kolkata')::date);
  v_sku text; v_vessel text; v_size text; v_ptype text; v_prefix text; v_product uuid;
  v_format text; v_ymd text; v_scope text; v_seq int; v_code text; v_batch_id uuid; v_existing public.manufacturing_batches%rowtype;
begin
  if v_variant_id is null then
    raise exception 'create_batch: variant_id is required' using errcode = 'invalid_parameter_value';
  end if;
  if v_planned < 0 then
    raise exception 'create_batch: planned_qty must be >= 0' using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotency: a retried request with the same key returns the original batch.
  if v_idem is not null then
    select * into v_existing from public.manufacturing_batches where creation_idempotency_key = v_idem;
    if found then
      return jsonb_build_object('created', false, 'batch_id', v_existing.id,
                                'batch_code', v_existing.batch_code, 'production_sequence', v_existing.production_sequence);
    end if;
  end if;

  select v.sku, v.vessel_type::text, v.size_label, pr.product_type, pr.batch_prefix, pr.id
    into v_sku, v_vessel, v_size, v_ptype, v_prefix, v_product
    from public.variants v join public.products pr on pr.id = v.product_id
   where v.id = v_variant_id;
  if not found then
    raise exception 'create_batch: variant % not found', v_variant_id using errcode = 'foreign_key_violation';
  end if;
  if v_prefix is null or btrim(v_prefix) = '' then
    raise exception 'create_batch: product has no batch_prefix set (set it before creating batches)' using errcode = 'invalid_parameter_value';
  end if;

  v_format := public.batch_format_code(v_vessel, v_size, v_ptype);
  v_ymd    := to_char(v_date, 'YYMMDD');
  v_scope  := upper(v_prefix) || '-' || upper(v_format) || '-' || v_ymd;
  v_seq    := public.next_batch_sequence(v_scope);
  v_code   := upper(v_prefix) || '-' || upper(v_format) || '-' || v_ymd || '-' || lpad(v_seq::text, 2, '0');

  insert into public.manufacturing_batches(
    batch_kind, batch_code, product_id, variant_id, sku_snapshot, product_type,
    manufacturing_date, production_sequence, lifecycle_status, planned_qty,
    cure_start_date, earliest_release_date, notes, created_by, creation_idempotency_key
  ) values (
    'production', v_code, v_product, v_variant_id, v_sku, v_ptype,
    v_date, v_seq, 'draft', v_planned,
    nullif(p->>'cure_start_date','')::date, nullif(p->>'earliest_release_date','')::date,
    nullif(p->>'notes',''), v_actor, v_idem
  ) returning id into v_batch_id;

  -- Optional candle spec (candle product type only).
  if v_ptype = 'candle' and (p->'candle') is not null then
    insert into public.batch_candle_spec(
      batch_id, wax_formula_code, wax_formula_version, fragrance_formula_code, fragrance_formula_version,
      wax_qty, fragrance_qty, fragrance_load_pct, wick_spec, vessel_spec,
      fill_weight_target_g, fill_weight_actual_g, fragrance_add_temp_c, pour_temp_c, operator_id, deviations, formula_snapshot
    ) values (
      v_batch_id,
      nullif(p->'candle'->>'wax_formula_code',''), nullif(p->'candle'->>'wax_formula_version',''),
      nullif(p->'candle'->>'fragrance_formula_code',''), nullif(p->'candle'->>'fragrance_formula_version',''),
      (p->'candle'->>'wax_qty')::numeric, (p->'candle'->>'fragrance_qty')::numeric, (p->'candle'->>'fragrance_load_pct')::numeric,
      nullif(p->'candle'->>'wick_spec',''), nullif(p->'candle'->>'vessel_spec',''),
      (p->'candle'->>'fill_weight_target_g')::numeric, (p->'candle'->>'fill_weight_actual_g')::numeric,
      (p->'candle'->>'fragrance_add_temp_c')::numeric, (p->'candle'->>'pour_temp_c')::numeric,
      nullif(p->'candle'->>'operator_id','')::uuid, nullif(p->'candle'->>'deviations',''), p->'candle'->'formula_snapshot'
    );
  end if;

  insert into public.batch_status_history(batch_id, dimension, from_state, to_state, actor_id)
  values (v_batch_id, 'lifecycle', null, 'draft', v_actor);

  return jsonb_build_object('created', true, 'batch_id', v_batch_id, 'batch_code', v_code, 'production_sequence', v_seq);
end $$;

-- ── update_batch — edit production record (draft / in_production only) ─────────
create or replace function public.update_batch(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := nullif(p->>'batch_id','')::uuid; b public.manufacturing_batches%rowtype;
begin
  if v_id is null then raise exception 'update_batch: batch_id is required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_id for update;
  if not found then raise exception 'update_batch: batch % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status not in ('draft','in_production') then
    raise exception 'update_batch: batch is % and no longer editable', b.lifecycle_status using errcode = 'check_violation';
  end if;

  -- Single atomic update: the quantity-conservation CHECK validates the FINAL row.
  update public.manufacturing_batches set
    planned_qty              = coalesce((p->>'planned_qty')::int, planned_qty),
    produced_qty             = coalesce((p->>'produced_qty')::int, produced_qty),
    pending_inspection_qty   = coalesce((p->>'pending_inspection_qty')::int, pending_inspection_qty),
    approved_qty             = coalesce((p->>'approved_qty')::int, approved_qty),
    rejected_qty             = coalesce((p->>'rejected_qty')::int, rejected_qty),
    qc_sampled_destroyed_qty = coalesce((p->>'qc_sampled_destroyed_qty')::int, qc_sampled_destroyed_qty),
    production_started_at     = coalesce(nullif(p->>'production_started_at','')::timestamptz, production_started_at),
    production_completed_at   = coalesce(nullif(p->>'production_completed_at','')::timestamptz, production_completed_at),
    cure_start_date          = coalesce(nullif(p->>'cure_start_date','')::date, cure_start_date),
    earliest_release_date    = coalesce(nullif(p->>'earliest_release_date','')::date, earliest_release_date),
    notes                    = coalesce(p->>'notes', notes),
    updated_at               = pg_catalog.now()
  where id = v_id;

  -- Optional candle spec upsert.
  if (p->'candle') is not null then
    insert into public.batch_candle_spec(batch_id, wax_formula_code, wax_formula_version, fragrance_formula_code, fragrance_formula_version,
      wax_qty, fragrance_qty, fragrance_load_pct, wick_spec, vessel_spec, fill_weight_target_g, fill_weight_actual_g,
      fragrance_add_temp_c, pour_temp_c, operator_id, deviations, formula_snapshot)
    values (v_id,
      nullif(p->'candle'->>'wax_formula_code',''), nullif(p->'candle'->>'wax_formula_version',''),
      nullif(p->'candle'->>'fragrance_formula_code',''), nullif(p->'candle'->>'fragrance_formula_version',''),
      (p->'candle'->>'wax_qty')::numeric, (p->'candle'->>'fragrance_qty')::numeric, (p->'candle'->>'fragrance_load_pct')::numeric,
      nullif(p->'candle'->>'wick_spec',''), nullif(p->'candle'->>'vessel_spec',''),
      (p->'candle'->>'fill_weight_target_g')::numeric, (p->'candle'->>'fill_weight_actual_g')::numeric,
      (p->'candle'->>'fragrance_add_temp_c')::numeric, (p->'candle'->>'pour_temp_c')::numeric,
      nullif(p->'candle'->>'operator_id','')::uuid, nullif(p->'candle'->>'deviations',''), p->'candle'->'formula_snapshot')
    on conflict (batch_id) do update set
      wax_formula_code = coalesce(excluded.wax_formula_code, public.batch_candle_spec.wax_formula_code),
      wax_formula_version = coalesce(excluded.wax_formula_version, public.batch_candle_spec.wax_formula_version),
      fragrance_formula_code = coalesce(excluded.fragrance_formula_code, public.batch_candle_spec.fragrance_formula_code),
      fragrance_formula_version = coalesce(excluded.fragrance_formula_version, public.batch_candle_spec.fragrance_formula_version),
      wax_qty = coalesce(excluded.wax_qty, public.batch_candle_spec.wax_qty),
      fragrance_qty = coalesce(excluded.fragrance_qty, public.batch_candle_spec.fragrance_qty),
      fragrance_load_pct = coalesce(excluded.fragrance_load_pct, public.batch_candle_spec.fragrance_load_pct),
      wick_spec = coalesce(excluded.wick_spec, public.batch_candle_spec.wick_spec),
      vessel_spec = coalesce(excluded.vessel_spec, public.batch_candle_spec.vessel_spec),
      fill_weight_target_g = coalesce(excluded.fill_weight_target_g, public.batch_candle_spec.fill_weight_target_g),
      fill_weight_actual_g = coalesce(excluded.fill_weight_actual_g, public.batch_candle_spec.fill_weight_actual_g),
      fragrance_add_temp_c = coalesce(excluded.fragrance_add_temp_c, public.batch_candle_spec.fragrance_add_temp_c),
      pour_temp_c = coalesce(excluded.pour_temp_c, public.batch_candle_spec.pour_temp_c),
      operator_id = coalesce(excluded.operator_id, public.batch_candle_spec.operator_id),
      deviations = coalesce(excluded.deviations, public.batch_candle_spec.deviations),
      formula_snapshot = coalesce(excluded.formula_snapshot, public.batch_candle_spec.formula_snapshot),
      updated_at = pg_catalog.now();
  end if;

  return jsonb_build_object('ok', true, 'batch_id', v_id);
end $$;

-- ── start_batch_production — draft → in_production (stamps start) ─────────────
create or replace function public.start_batch_production(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; b public.manufacturing_batches%rowtype;
begin
  if v_id is null then raise exception 'start_batch_production: batch_id required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_id for update;
  if not found then raise exception 'start_batch_production: batch % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status = 'in_production' then return jsonb_build_object('ok', true, 'already', true); end if;
  if b.lifecycle_status <> 'draft' then
    raise exception 'start_batch_production: cannot start from %', b.lifecycle_status using errcode = 'check_violation';
  end if;
  update public.manufacturing_batches
     set lifecycle_status = 'in_production',
         production_started_at = coalesce(production_started_at, pg_catalog.now()),
         updated_at = pg_catalog.now()
   where id = v_id;
  insert into public.batch_status_history(batch_id, dimension, from_state, to_state, actor_id)
  values (v_id, 'lifecycle', 'draft', 'in_production', v_actor);
  return jsonb_build_object('ok', true);
end $$;

-- ── materials & supplier lots (idempotent registration) ──────────────────────
create or replace function public.register_material(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_name text := nullif(btrim(p->>'name'),''); v_type text := nullif(p->>'material_type','');
begin
  if v_name is null or v_type is null then raise exception 'register_material: name and material_type required' using errcode = 'invalid_parameter_value'; end if;
  insert into public.materials(name, material_type, default_uom)
  values (v_name, v_type, nullif(p->>'default_uom',''))
  on conflict (name, material_type) do update set updated_at = pg_catalog.now()
  returning id into v_id;
  return jsonb_build_object('material_id', v_id);
end $$;

create or replace function public.register_material_lot(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_material uuid := nullif(p->>'material_id','')::uuid; v_lot text := nullif(btrim(p->>'supplier_lot_code'),'');
begin
  if v_material is null or v_lot is null then raise exception 'register_material_lot: material_id and supplier_lot_code required' using errcode = 'invalid_parameter_value'; end if;
  if not exists (select 1 from public.materials where id = v_material) then
    raise exception 'register_material_lot: material % not found', v_material using errcode = 'foreign_key_violation';
  end if;
  insert into public.material_lots(material_id, supplier_name, supplier_lot_code, received_qty, uom, received_on)
  values (v_material, nullif(p->>'supplier_name',''), v_lot, (p->>'received_qty')::numeric, nullif(p->>'uom',''), nullif(p->>'received_on','')::date)
  on conflict (material_id, supplier_lot_code) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.material_lots where material_id = v_material and supplier_lot_code = v_lot;
  end if;
  return jsonb_build_object('material_lot_id', v_id);
end $$;

create or replace function public.record_material_consumption(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid; v_lot uuid := nullif(p->>'material_lot_id','')::uuid;
        v_qty numeric := (p->>'qty_consumed')::numeric; b public.manufacturing_batches%rowtype;
begin
  if v_batch is null or v_lot is null or v_qty is null or v_qty <= 0 then
    raise exception 'record_material_consumption: batch_id, material_lot_id and positive qty_consumed required' using errcode = 'invalid_parameter_value';
  end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'record_material_consumption: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status not in ('draft','in_production') then
    raise exception 'record_material_consumption: batch is % — materials can only be recorded during production', b.lifecycle_status using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.material_lots where id = v_lot) then
    raise exception 'record_material_consumption: material_lot % not found', v_lot using errcode = 'foreign_key_violation';
  end if;
  insert into public.batch_material_consumption(batch_id, material_lot_id, qty_consumed, uom)
  values (v_batch, v_lot, v_qty, nullif(p->>'uom',''))
  on conflict (batch_id, material_lot_id) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'record_material_consumption: this lot is already recorded for this batch' using errcode = 'unique_violation';
  end if;
  return jsonb_build_object('ok', true, 'consumption_id', v_id);
end $$;

-- ── grants: service_role only ─────────────────────────────────────────────────
revoke all on function public.create_batch(jsonb)                 from public, anon, authenticated;
revoke all on function public.update_batch(jsonb)                 from public, anon, authenticated;
revoke all on function public.start_batch_production(jsonb)       from public, anon, authenticated;
revoke all on function public.register_material(jsonb)            from public, anon, authenticated;
revoke all on function public.register_material_lot(jsonb)        from public, anon, authenticated;
revoke all on function public.record_material_consumption(jsonb)  from public, anon, authenticated;
grant execute on function public.create_batch(jsonb)                to service_role;
grant execute on function public.update_batch(jsonb)                to service_role;
grant execute on function public.start_batch_production(jsonb)      to service_role;
grant execute on function public.register_material(jsonb)           to service_role;
grant execute on function public.register_material_lot(jsonb)       to service_role;
grant execute on function public.record_material_consumption(jsonb) to service_role;
