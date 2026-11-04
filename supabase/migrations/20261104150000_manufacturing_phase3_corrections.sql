-- ============================================================================
-- MANUFACTURING — Phase 3 corrections (additive; found in final verification)
-- ============================================================================
-- (1) create_batch: a reused creation idempotency key with CONFLICTING identity
--     input must raise a conflict, never silently return/alter an unrelated batch.
-- (2) material consumption: a batch may legitimately consume the same supplier lot
--     in MULTIPLE events, so the strict unique(batch_id, material_lot_id) is dropped
--     and replaced by append-only history + an idempotency key that dedupes only true
--     retries. Adds unit-compatibility and over-receipt validation (traceability-only:
--     materials never touch variants.stock / the inventory ledger).
-- STRICT: still NON-STOCK. DO NOT apply to production without separate approval.
-- ============================================================================

-- (2a) Append-only consumption history + retry idempotency.
alter table public.batch_material_consumption drop constraint if exists batch_material_consumption_batch_id_material_lot_id_key;
alter table public.batch_material_consumption add column if not exists idempotency_key text;
create unique index if not exists batch_material_consumption_idem_uidx
  on public.batch_material_consumption(idempotency_key) where idempotency_key is not null;

-- (1) create_batch — idempotency-conflict aware.
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

  -- Idempotency: identical retry → original batch; CONFLICTING input on the same key → error.
  if v_idem is not null then
    select * into v_existing from public.manufacturing_batches where creation_idempotency_key = v_idem;
    if found then
      if v_existing.variant_id <> v_variant_id
         or v_existing.manufacturing_date is distinct from v_date
         or v_existing.planned_qty <> v_planned then
        raise exception 'create_batch: idempotency key % already used for a different request (variant/date/planned mismatch)', v_idem
          using errcode = 'unique_violation';
      end if;
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

-- (2b) record_material_consumption — append-only, idempotent, unit + over-receipt safe.
create or replace function public.record_material_consumption(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid; v_lot uuid := nullif(p->>'material_lot_id','')::uuid;
  v_qty numeric := (p->>'qty_consumed')::numeric; v_uom text := nullif(btrim(p->>'uom'),''); v_idem text := nullif(p->>'idempotency_key','');
  b public.manufacturing_batches%rowtype; l public.material_lots%rowtype; v_prior numeric;
begin
  if v_batch is null or v_lot is null or v_qty is null or v_qty <= 0 then
    raise exception 'record_material_consumption: batch_id, material_lot_id and positive qty_consumed required' using errcode = 'invalid_parameter_value';
  end if;

  -- Retry idempotency: a repeat with the same key is a no-op returning the original row.
  if v_idem is not null then
    select id into v_id from public.batch_material_consumption where idempotency_key = v_idem;
    if found then return jsonb_build_object('ok', true, 'idempotent', true, 'consumption_id', v_id); end if;
  end if;

  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'record_material_consumption: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status not in ('draft','in_production') then
    raise exception 'record_material_consumption: batch is % — materials can only be recorded during production', b.lifecycle_status using errcode = 'check_violation';
  end if;

  select * into l from public.material_lots where id = v_lot;
  if not found then raise exception 'record_material_consumption: material_lot % not found', v_lot using errcode = 'foreign_key_violation'; end if;

  -- Unit compatibility: a provided unit must match the lot's unit (no misleading cross-unit records).
  if v_uom is not null and l.uom is not null and upper(v_uom) <> upper(l.uom) then
    raise exception 'record_material_consumption: unit % does not match lot unit %', v_uom, l.uom using errcode = 'check_violation';
  end if;

  -- Cannot consume more of a lot than was received (cumulative across ALL batches), when received_qty is known.
  if l.received_qty is not null then
    select coalesce(sum(qty_consumed), 0) into v_prior from public.batch_material_consumption where material_lot_id = v_lot;
    if v_prior + v_qty > l.received_qty then
      raise exception 'record_material_consumption: cumulative %+% exceeds received % for lot %', v_prior, v_qty, l.received_qty, l.supplier_lot_code
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.batch_material_consumption(batch_id, material_lot_id, qty_consumed, uom, idempotency_key)
  values (v_batch, v_lot, v_qty, coalesce(v_uom, l.uom), v_idem)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'consumption_id', v_id);
end $$;

revoke all on function public.create_batch(jsonb)                from public, anon, authenticated;
revoke all on function public.record_material_consumption(jsonb) from public, anon, authenticated;
grant execute on function public.create_batch(jsonb)                to service_role;
grant execute on function public.record_material_consumption(jsonb) to service_role;
