-- Phase 12 (acceptance correction) — unblock the "advanced to quality_check without recording produced" trap.
--
-- DEFECT: update_batch only allowed produced/pending edits in draft/in_production. An operator who advanced a
-- batch to quality_check WITHOUT recording a produced quantity was then stuck: the production record was
-- read-only AND routine QC could not be recorded (0 units pending inspection). The batch became a dead end.
--
-- FIX: additionally allow the production record to be recorded at quality_check WHEN NO inspection has started
-- (produced/approved/rejected/samples all 0) — i.e. exactly the "forgot to record produced" recovery. The
-- quantity-conservation CHECK still validates the final row, so this cannot create an inconsistent batch, and
-- once any QC is recorded the record locks again. Only the guard changes; the body is otherwise unchanged.
create or replace function public.update_batch(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_id uuid := nullif(p->>'batch_id','')::uuid; b public.manufacturing_batches%rowtype;
begin
  if v_id is null then raise exception 'update_batch: batch_id is required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_id for update;
  if not found then raise exception 'update_batch: batch % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status not in ('draft','in_production')
     and not (b.lifecycle_status = 'quality_check' and b.produced_qty = 0 and b.approved_qty = 0 and b.rejected_qty = 0 and b.qc_sampled_destroyed_qty = 0) then
    raise exception 'update_batch: batch is % and no longer editable', b.lifecycle_status using errcode = 'check_violation';
  end if;

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
end $function$;

revoke all on function public.update_batch(jsonb) from public, anon, authenticated;
grant  execute on function public.update_batch(jsonb) to service_role;
