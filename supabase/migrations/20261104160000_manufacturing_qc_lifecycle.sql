-- ============================================================================
-- MANUFACTURING — Phase 4: Quality Control & Batch Lifecycle (ADDITIVE, NON-STOCK)
-- ============================================================================
-- Adds the 'qc_approved' lifecycle state (DISTINCT from the later inventory 'released'),
-- versioned QC templates, routine + design-validation QC records (append-only), QC
-- quantity reconciliation, controlled lifecycle transitions with evidence/cure/SoD
-- gates, and hold/resume. NOTHING here moves stock, releases inventory, or allocates
-- to orders — qc_approved only marks a batch QC-cleared; stock release is a later phase.
-- SECURITY DEFINER, search_path='', service_role-only. DO NOT apply to prod without approval.
-- ============================================================================

-- ── 1. Lifecycle: add 'qc_approved' (between quality_check and the later 'released') ──
alter table public.manufacturing_batches drop constraint if exists manufacturing_batches_lifecycle_status_check;
alter table public.manufacturing_batches drop constraint if exists mfg_batches_lifecycle_chk;  -- repeatable: re-add cleanly
alter table public.manufacturing_batches add constraint mfg_batches_lifecycle_chk
  check (lifecycle_status in ('draft','in_production','curing','quality_check','qc_approved','released','rejected','closed'));

-- ── 2. QC record columns (append-only history) ───────────────────────────────
alter table public.batch_quality_checks add column if not exists inspected_qty integer not null default 0 check (inspected_qty >= 0);
alter table public.batch_quality_checks add column if not exists approved_delta integer not null default 0 check (approved_delta >= 0);
alter table public.batch_quality_checks add column if not exists rejected_delta integer not null default 0 check (rejected_delta >= 0);
alter table public.batch_quality_checks add column if not exists sampled_destroyed_delta integer not null default 0 check (sampled_destroyed_delta >= 0);
alter table public.batch_quality_checks add column if not exists approval_notes text;
alter table public.batch_quality_checks add column if not exists config_fingerprint text;
alter table public.batch_quality_checks add column if not exists idempotency_key text;
create unique index if not exists batch_qc_idem_uidx on public.batch_quality_checks(idempotency_key) where idempotency_key is not null;
create index if not exists batch_qc_fingerprint_idx on public.batch_quality_checks(config_fingerprint) where config_fingerprint is not null;
-- Make QC history append-only (preserve historical QC events + corrections).
revoke update, delete on public.batch_quality_checks from service_role;

-- ── 3. Config fingerprint — identifies the EXACT validated configuration ──────
create or replace function public.batch_config_fingerprint(p_batch_id uuid)
returns text language sql stable
set search_path = ''
as $$
  select md5(coalesce(b.variant_id::text,'') || '|' || coalesce(b.product_type,'') || '|' ||
             coalesce(cs.wax_formula_code,'') || ':' || coalesce(cs.wax_formula_version,'') || '|' ||
             coalesce(cs.fragrance_formula_code,'') || ':' || coalesce(cs.fragrance_formula_version,'') || '|' ||
             coalesce(cs.fragrance_load_pct::text,'') || '|' || coalesce(cs.wick_spec,'') || '|' ||
             coalesce(cs.vessel_spec,'') || '|' || coalesce(cs.fill_weight_target_g::text,''))
  from public.manufacturing_batches b
  left join public.batch_candle_spec cs on cs.batch_id = b.id
  where b.id = p_batch_id;
$$;

-- ── 4. Versioned QC templates (immutable history: a change = a new version) ───
create or replace function public.upsert_qc_template(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_pt text := nullif(p->>'product_type',''); v_cfg text := coalesce(nullif(p->>'variant_config',''),''); v_ver int; v_id uuid;
begin
  if v_pt is null then raise exception 'upsert_qc_template: product_type required' using errcode = 'invalid_parameter_value'; end if;
  select coalesce(max(version),0) + 1 into v_ver from public.qc_templates where product_type = v_pt and variant_config = v_cfg;
  insert into public.qc_templates(product_type, variant_config, version, name, required_checks, active)
  values (v_pt, v_cfg, v_ver, nullif(p->>'name',''), coalesce(p->'required_checks','[]'::jsonb), coalesce((p->>'active')::boolean, true))
  returning id into v_id;
  return jsonb_build_object('template_id', v_id, 'version', v_ver);
end $$;

-- ── 5. Routine QC — append record + ATOMIC quantity reconciliation, idempotent ─
create or replace function public.record_qc(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
  v_idem text := nullif(p->>'idempotency_key',''); v_tpl uuid := nullif(p->>'template_id','')::uuid;
  v_insp int := coalesce((p->>'inspected_qty')::int,0); v_appr int := coalesce((p->>'approved_delta')::int,0);
  v_rej int := coalesce((p->>'rejected_delta')::int,0); v_smp int := coalesce((p->>'sampled_destroyed_delta')::int,0);
  v_result text := nullif(p->>'result',''); b public.manufacturing_batches%rowtype; v_id uuid; v_req jsonb; v_key text; v_tver int;
begin
  if v_batch is null then raise exception 'record_qc: batch_id required' using errcode = 'invalid_parameter_value'; end if;
  if v_insp <> v_appr + v_rej + v_smp then
    raise exception 'record_qc: inspected_qty (%) must equal approved+rejected+sampled (%+%+%)', v_insp, v_appr, v_rej, v_smp using errcode = 'check_violation';
  end if;
  if v_result is not null and v_result not in ('pass','fail','conditional') then
    raise exception 'record_qc: invalid result %', v_result using errcode = 'invalid_parameter_value';
  end if;

  if v_idem is not null then
    select id into v_id from public.batch_quality_checks where idempotency_key = v_idem;
    if found then return jsonb_build_object('ok', true, 'idempotent', true, 'qc_id', v_id); end if;
  end if;

  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'record_qc: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.lifecycle_status not in ('curing','quality_check') then
    raise exception 'record_qc: batch is % — routine QC runs during curing/quality_check', b.lifecycle_status using errcode = 'check_violation';
  end if;

  -- Required-checks evidence: every required check key must be present in measurements.
  if v_tpl is not null then
    select required_checks, version into v_req, v_tver from public.qc_templates where id = v_tpl;
    if v_req is not null then
      select string_agg(elem, ',') into v_key
      from (select jsonb_array_elements_text(
              case when jsonb_typeof(v_req) = 'array' then v_req else coalesce(v_req->'required','[]'::jsonb) end) as elem) s
      where not (coalesce(p->'measurements','{}'::jsonb) ? elem);
      if v_key is not null then
        raise exception 'record_qc: missing required checks: %', v_key using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Quantity reconciliation: move inspected units out of pending into approved/rejected/sampled.
  if v_insp > b.pending_inspection_qty then
    raise exception 'record_qc: inspected % exceeds pending %', v_insp, b.pending_inspection_qty using errcode = 'check_violation';
  end if;
  update public.manufacturing_batches set
    pending_inspection_qty   = pending_inspection_qty - v_insp,
    approved_qty             = approved_qty + v_appr,
    rejected_qty             = rejected_qty + v_rej,
    qc_sampled_destroyed_qty = qc_sampled_destroyed_qty + v_smp,
    updated_at = pg_catalog.now()
  where id = v_batch;

  insert into public.batch_quality_checks(
    batch_id, template_id, template_version, check_type, sample_size, sample_destroyed_qty,
    inspected_qty, approved_delta, rejected_delta, sampled_destroyed_delta,
    result, measurements, criteria, deviations, approval_notes, inspector_id, performed_at, idempotency_key
  ) values (
    v_batch, v_tpl, v_tver, 'routine', coalesce((p->>'sample_size')::int,0), v_smp,
    v_insp, v_appr, v_rej, v_smp,
    v_result, coalesce(p->'measurements','{}'::jsonb), p->'criteria', nullif(p->>'deviations',''), nullif(p->>'approval_notes',''),
    v_actor, pg_catalog.now(), v_idem
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'qc_id', v_id);
end $$;

-- ── 6. Product-design burn validation — distinct, config-fingerprinted, no qty move ─
create or replace function public.record_design_validation(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        v_idem text := nullif(p->>'idempotency_key',''); v_result text := nullif(p->>'result',''); v_fp text; v_id uuid;
begin
  if v_batch is null then raise exception 'record_design_validation: batch_id required' using errcode = 'invalid_parameter_value'; end if;
  if v_result is not null and v_result not in ('pass','fail','conditional') then
    raise exception 'record_design_validation: invalid result %', v_result using errcode = 'invalid_parameter_value';
  end if;
  if v_idem is not null then
    select id into v_id from public.batch_quality_checks where idempotency_key = v_idem;
    if found then return jsonb_build_object('ok', true, 'idempotent', true, 'qc_id', v_id); end if;
  end if;
  if not exists (select 1 from public.manufacturing_batches where id = v_batch) then
    raise exception 'record_design_validation: batch % not found', v_batch using errcode = 'foreign_key_violation';
  end if;
  v_fp := public.batch_config_fingerprint(v_batch);
  insert into public.batch_quality_checks(
    batch_id, check_type, sample_size, sample_destroyed_qty, result, measurements, criteria, deviations,
    inspector_id, performed_at, config_fingerprint, idempotency_key
  ) values (
    v_batch, 'design_validation', coalesce((p->>'sample_size')::int,0), coalesce((p->>'sample_destroyed_qty')::int,0),
    v_result, coalesce(p->'measurements','{}'::jsonb), p->'criteria', nullif(p->>'deviations',''),
    v_actor, pg_catalog.now(), v_fp, v_idem
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'qc_id', v_id, 'config_fingerprint', v_fp);
end $$;

-- ── 7. Controlled lifecycle transitions (evidence + cure + SoD gates) ─────────
create or replace function public.advance_batch_lifecycle(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := nullif(p->>'batch_id','')::uuid; v_to text := nullif(p->>'to_status','');
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  v_allow_override boolean := coalesce((p->>'allow_sod_override')::boolean, false);
  b public.manufacturing_batches%rowtype; v_ok boolean := false; v_passes int; v_sod_conflict boolean;
begin
  if v_batch is null or v_to is null then raise exception 'advance_batch_lifecycle: batch_id and to_status required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'advance_batch_lifecycle: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.recall_state = 'recalled' then raise exception 'advance_batch_lifecycle: batch is recalled' using errcode = 'check_violation'; end if;

  -- Allowed lifecycle transitions (release/closed are NOT reachable here — later phases).
  v_ok := (b.lifecycle_status = 'draft'         and v_to = 'in_production')
       or (b.lifecycle_status = 'in_production' and v_to in ('curing','rejected'))
       or (b.lifecycle_status = 'curing'        and v_to in ('quality_check','rejected'))
       or (b.lifecycle_status = 'quality_check' and v_to in ('qc_approved','in_production','rejected'))  -- in_production = rework
       or (b.lifecycle_status = 'qc_approved'   and v_to = 'quality_check');                              -- re-open / correction
  if not v_ok then
    raise exception 'advance_batch_lifecycle: illegal transition % -> %', b.lifecycle_status, v_to using errcode = 'check_violation';
  end if;

  -- QC approval gate.
  if v_to = 'qc_approved' then
    if b.recall_state <> 'none' then raise exception 'advance_batch_lifecycle: cannot approve a held batch' using errcode = 'check_violation'; end if;
    select count(*) into v_passes from public.batch_quality_checks where batch_id = v_batch and check_type = 'routine' and result = 'pass';
    if v_passes = 0 then raise exception 'advance_batch_lifecycle: a passing routine QC is required before approval' using errcode = 'check_violation'; end if;
    -- Cure eligibility (NOT auto-approval): the eligible date must be set and reached.
    if b.earliest_release_date is null then raise exception 'advance_batch_lifecycle: earliest_release_date (cure) not set' using errcode = 'check_violation'; end if;
    if b.earliest_release_date > (pg_catalog.now() at time zone 'Asia/Kolkata')::date then
      raise exception 'advance_batch_lifecycle: cure not complete (eligible %)', b.earliest_release_date using errcode = 'check_violation';
    end if;
    -- Separation of duties: approver must differ from every routine QC inspector, unless an authorised override is supplied.
    select exists(select 1 from public.batch_quality_checks where batch_id = v_batch and check_type = 'routine' and inspector_id = v_actor) into v_sod_conflict;
    if v_sod_conflict and not v_allow_override then
      raise exception 'advance_batch_lifecycle: separation of duties — the QC inspector cannot approve their own batch' using errcode = 'check_violation';
    end if;
    update public.manufacturing_batches set lifecycle_status = 'qc_approved', approved_by = v_actor, approved_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = v_batch;
  else
    update public.manufacturing_batches set lifecycle_status = v_to, updated_at = pg_catalog.now() where id = v_batch;
  end if;

  insert into public.batch_status_history(batch_id, dimension, from_state, to_state, reason, actor_id)
  values (v_batch, 'lifecycle', b.lifecycle_status, v_to,
          case when v_to='qc_approved' and v_sod_conflict and v_allow_override then coalesce(v_reason,'') || ' [SoD override]' else v_reason end,
          v_actor);
  return jsonb_build_object('ok', true, 'from', b.lifecycle_status, 'to', v_to, 'sod_override', (v_to='qc_approved' and v_sod_conflict and v_allow_override));
end $$;

-- ── 8. Hold / resume (recall_state dimension; true recall is a later phase) ───
create or replace function public.set_batch_hold(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        v_hold boolean := coalesce((p->>'hold')::boolean, true); b public.manufacturing_batches%rowtype; v_new text;
begin
  if v_batch is null then raise exception 'set_batch_hold: batch_id required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'set_batch_hold: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.recall_state = 'recalled' then raise exception 'set_batch_hold: batch is recalled (use the recall workflow)' using errcode = 'check_violation'; end if;
  v_new := case when v_hold then 'on_hold' else 'none' end;
  update public.manufacturing_batches set recall_state = v_new, updated_at = pg_catalog.now() where id = v_batch;
  insert into public.batch_status_history(batch_id, dimension, from_state, to_state, reason, actor_id)
  values (v_batch, 'recall', b.recall_state, v_new, nullif(p->>'reason',''), v_actor);
  return jsonb_build_object('ok', true, 'recall_state', v_new);
end $$;

-- ── 9. grants: service_role only ──────────────────────────────────────────────
revoke all on function public.batch_config_fingerprint(uuid)       from public, anon, authenticated;
revoke all on function public.upsert_qc_template(jsonb)            from public, anon, authenticated;
revoke all on function public.record_qc(jsonb)                     from public, anon, authenticated;
revoke all on function public.record_design_validation(jsonb)      from public, anon, authenticated;
revoke all on function public.advance_batch_lifecycle(jsonb)       from public, anon, authenticated;
revoke all on function public.set_batch_hold(jsonb)                from public, anon, authenticated;
grant execute on function public.batch_config_fingerprint(uuid)    to service_role;
grant execute on function public.upsert_qc_template(jsonb)         to service_role;
grant execute on function public.record_qc(jsonb)                  to service_role;
grant execute on function public.record_design_validation(jsonb)   to service_role;
grant execute on function public.advance_batch_lifecycle(jsonb)    to service_role;
grant execute on function public.set_batch_hold(jsonb)             to service_role;
