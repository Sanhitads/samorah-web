-- ============================================================================
-- MANUFACTURING — Phase 4 hardening (ADDITIVE, NON-STOCK) from final verification
-- ============================================================================
-- (1) record_qc now evaluates required checks against ACCEPTANCE CRITERIA (numeric
--     min/max + categorical allowed), not mere key presence. A failed MANDATORY check
--     blocks an overall 'pass' unless an audited, non-critical exception is supplied;
--     a CRITICAL failure can NEVER be bypassed.
-- (2) qc_approved eligibility tightened: the whole batch must be fully inspected
--     (pending_inspection_qty = 0), have approved_qty > 0, and ≥1 passing routine QC.
-- (3) Design validations get explicit states (approved/superseded/revoked) in their own
--     table keyed by an immutable config fingerprint; only an 'approved' validation for
--     the CURRENT config qualifies — a revoked/superseded one never does (Phase 6 gate).
-- (4) Reopening a qc_approved batch invalidates the prior approval (clears approved_by,
--     bumps qc_revision) and REQUIRES a reason; critical transitions require reasons.
-- Still NON-STOCK. DO NOT apply to production without separate approval.
-- ============================================================================

alter table public.manufacturing_batches add column if not exists qc_revision integer not null default 0;

-- ── Design validations with lifecycle state (separate, state-mutable, no delete) ──
create table if not exists public.batch_design_validations (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.manufacturing_batches(id) on delete restrict,
  variant_id        uuid not null references public.variants(id) on delete restrict,
  config_fingerprint text not null,
  result            text check (result in ('pass','fail','conditional')),
  measurements      jsonb,
  criteria          jsonb,
  deviations        text,
  state             text not null default 'approved' check (state in ('approved','superseded','revoked')),
  validated_by      uuid references public.users(id) on delete set null,
  validated_at      timestamptz not null default now(),
  superseded_by     uuid references public.batch_design_validations(id) on delete set null,
  revoked_by        uuid references public.users(id) on delete set null,
  revoked_reason    text,
  revoked_at        timestamptz,
  idempotency_key   text,
  created_at        timestamptz not null default now()
);
create unique index if not exists bdv_idem_uidx on public.batch_design_validations(idempotency_key) where idempotency_key is not null;
create index if not exists bdv_fingerprint_idx on public.batch_design_validations(config_fingerprint, state);
alter table public.batch_design_validations enable row level security;
grant select, insert, update on public.batch_design_validations to service_role;  -- update = state only; no delete (history)

-- ── record_qc — acceptance-criteria evaluation + audited exception ────────────
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
  v_result text := nullif(p->>'result',''); v_allow_exc boolean := coalesce((p->>'allow_exception')::boolean,false);
  v_exc_reason text := nullif(p->>'exception_reason','');
  b public.manufacturing_batches%rowtype; v_id uuid; v_req jsonb; v_checks jsonb; v_tver int;
  v_el jsonb; v_key text; v_mand boolean; v_crit boolean; v_mtxt text; v_min numeric; v_max numeric;
  v_fail text[] := '{}'; v_critfail text[] := '{}';
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

  -- Acceptance-criteria evaluation against the template's required checks.
  if v_tpl is not null then
    select required_checks, version into v_req, v_tver from public.qc_templates where id = v_tpl;
    v_checks := case when jsonb_typeof(v_req) = 'array' then v_req
                     when v_req is null then '[]'::jsonb else coalesce(v_req->'required','[]'::jsonb) end;
    for v_el in select * from jsonb_array_elements(v_checks) loop
      if jsonb_typeof(v_el) = 'string' then
        v_key := v_el #>> '{}'; v_mand := true; v_crit := false; v_min := null; v_max := null;
      else
        v_key := v_el->>'key'; v_mand := coalesce((v_el->>'mandatory')::boolean, true); v_crit := coalesce((v_el->>'critical')::boolean, false);
        v_min := (v_el->>'min')::numeric; v_max := (v_el->>'max')::numeric;
      end if;
      if v_key is null then continue; end if;
      v_mtxt := coalesce(p->'measurements','{}'::jsonb) ->> v_key;
      -- A required check fails if: missing; below min; above max; or outside the allowed set.
      if v_mtxt is null
         or (v_min is not null and v_mtxt::numeric < v_min)
         or (v_max is not null and v_mtxt::numeric > v_max)
         or (jsonb_typeof(v_el) = 'object' and (v_el ? 'allowed') and not ((v_el->'allowed') ? v_mtxt)) then
        if v_mand then v_fail := v_fail || v_key; end if;
        if v_crit then v_critfail := v_critfail || v_key; end if;
      end if;
    end loop;

    if v_result = 'pass' and array_length(v_fail,1) is not null then
      if array_length(v_critfail,1) is not null then
        raise exception 'record_qc: CRITICAL check(s) failed (%) — cannot pass or override', array_to_string(v_critfail,',') using errcode = 'check_violation';
      end if;
      if not (v_allow_exc and v_exc_reason is not null) then
        raise exception 'record_qc: mandatory check(s) failed (%) — cannot pass without an audited exception', array_to_string(v_fail,',') using errcode = 'check_violation';
      end if;
    end if;
  end if;

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
    v_result, coalesce(p->'measurements','{}'::jsonb), p->'criteria',
    nullif(p->>'deviations',''),
    case when v_allow_exc and v_exc_reason is not null then coalesce(nullif(p->>'approval_notes',''),'') || ' [exception: ' || v_exc_reason || ']' else nullif(p->>'approval_notes','') end,
    v_actor, pg_catalog.now(), v_idem
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'qc_id', v_id, 'failed_checks', to_jsonb(v_fail));
end $$;

-- ── record_design_validation — own table + state; supersede prior same-config pass ─
create or replace function public.record_design_validation(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        v_idem text := nullif(p->>'idempotency_key',''); v_result text := nullif(p->>'result',''); v_fp text; v_id uuid; v_variant uuid;
begin
  if v_batch is null then raise exception 'record_design_validation: batch_id required' using errcode = 'invalid_parameter_value'; end if;
  if v_result is not null and v_result not in ('pass','fail','conditional') then
    raise exception 'record_design_validation: invalid result %', v_result using errcode = 'invalid_parameter_value';
  end if;
  if v_idem is not null then
    select id into v_id from public.batch_design_validations where idempotency_key = v_idem;
    if found then return jsonb_build_object('ok', true, 'idempotent', true, 'validation_id', v_id); end if;
  end if;
  select variant_id into v_variant from public.manufacturing_batches where id = v_batch;
  if not found then raise exception 'record_design_validation: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  v_fp := public.batch_config_fingerprint(v_batch);

  insert into public.batch_design_validations(batch_id, variant_id, config_fingerprint, result, measurements, criteria, deviations, state, validated_by, idempotency_key)
  values (v_batch, v_variant, v_fp, v_result, coalesce(p->'measurements','{}'::jsonb), p->'criteria', nullif(p->>'deviations',''), 'approved', v_actor, v_idem)
  returning id into v_id;

  -- A new PASS supersedes any prior approved pass for the SAME configuration.
  if v_result = 'pass' then
    update public.batch_design_validations
      set state = 'superseded', superseded_by = v_id
      where config_fingerprint = v_fp and result = 'pass' and state = 'approved' and id <> v_id;
  end if;
  return jsonb_build_object('ok', true, 'validation_id', v_id, 'config_fingerprint', v_fp);
end $$;

create or replace function public.revoke_design_validation(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := nullif(p->>'validation_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
begin
  if v_id is null or v_reason is null then raise exception 'revoke_design_validation: validation_id and reason required' using errcode = 'invalid_parameter_value'; end if;
  update public.batch_design_validations set state = 'revoked', revoked_by = v_actor, revoked_reason = v_reason, revoked_at = pg_catalog.now()
   where id = v_id and state <> 'revoked';
  if not found then raise exception 'revoke_design_validation: validation % not found or already revoked', v_id using errcode = 'check_violation'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── advance_batch_lifecycle — stronger eligibility + reopen invalidation + reasons ─
create or replace function public.advance_batch_lifecycle(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := nullif(p->>'batch_id','')::uuid; v_to text := nullif(p->>'to_status','');
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  v_allow_override boolean := coalesce((p->>'allow_sod_override')::boolean, false);
  b public.manufacturing_batches%rowtype; v_ok boolean := false; v_passes int; v_sod_conflict boolean; v_reopen boolean := false;
begin
  if v_batch is null or v_to is null then raise exception 'advance_batch_lifecycle: batch_id and to_status required' using errcode = 'invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'advance_batch_lifecycle: batch % not found', v_batch using errcode = 'foreign_key_violation'; end if;
  if b.recall_state = 'recalled' then raise exception 'advance_batch_lifecycle: batch is recalled' using errcode = 'check_violation'; end if;

  -- Reopen requires an explicit allow_reopen (set only by the qc_approve-gated service path),
  -- so a lower 'quality_check' transition can never silently reopen & invalidate an approval.
  v_reopen := (b.lifecycle_status = 'qc_approved' and v_to = 'quality_check' and coalesce((p->>'allow_reopen')::boolean, false));
  v_ok := (b.lifecycle_status = 'draft'         and v_to = 'in_production')
       or (b.lifecycle_status = 'in_production' and v_to in ('curing','rejected'))
       or (b.lifecycle_status = 'curing'        and v_to in ('quality_check','rejected'))
       or (b.lifecycle_status = 'quality_check' and v_to in ('qc_approved','in_production','rejected'))
       or v_reopen;
  if not v_ok then
    raise exception 'advance_batch_lifecycle: illegal transition % -> %', b.lifecycle_status, v_to using errcode = 'check_violation';
  end if;

  -- Reasons are mandatory for consequential transitions.
  if (v_to = 'rejected' or v_reopen) and v_reason is null then
    raise exception 'advance_batch_lifecycle: a reason is required to % a batch', case when v_reopen then 'reopen' else 'reject' end using errcode = 'invalid_parameter_value';
  end if;

  if v_to = 'qc_approved' then
    if b.recall_state <> 'none' then raise exception 'advance_batch_lifecycle: cannot approve a held batch' using errcode = 'check_violation'; end if;
    -- Whole-batch eligibility: fully inspected, something approved, and a passing routine QC exists.
    if b.pending_inspection_qty <> 0 then raise exception 'advance_batch_lifecycle: inspection incomplete (% pending)', b.pending_inspection_qty using errcode = 'check_violation'; end if;
    if b.approved_qty <= 0 then raise exception 'advance_batch_lifecycle: no approved quantity to release' using errcode = 'check_violation'; end if;
    select count(*) into v_passes from public.batch_quality_checks where batch_id = v_batch and check_type = 'routine' and result = 'pass';
    if v_passes = 0 then raise exception 'advance_batch_lifecycle: a passing routine QC is required before approval' using errcode = 'check_violation'; end if;
    if b.earliest_release_date is null then raise exception 'advance_batch_lifecycle: earliest_release_date (cure) not set' using errcode = 'check_violation'; end if;
    if b.earliest_release_date > (pg_catalog.now() at time zone 'Asia/Kolkata')::date then
      raise exception 'advance_batch_lifecycle: cure not complete (eligible %)', b.earliest_release_date using errcode = 'check_violation';
    end if;
    select exists(select 1 from public.batch_quality_checks where batch_id = v_batch and check_type = 'routine' and inspector_id = v_actor) into v_sod_conflict;
    if v_sod_conflict and not v_allow_override then
      raise exception 'advance_batch_lifecycle: separation of duties — the QC inspector cannot approve their own batch' using errcode = 'check_violation';
    end if;
    update public.manufacturing_batches set lifecycle_status = 'qc_approved', approved_by = v_actor, approved_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = v_batch;
  elsif v_reopen then
    -- Invalidate the prior approval for future release eligibility (QC revision bump).
    update public.manufacturing_batches set lifecycle_status = 'quality_check', approved_by = null, approved_at = null,
           qc_revision = qc_revision + 1, updated_at = pg_catalog.now() where id = v_batch;
  else
    update public.manufacturing_batches set lifecycle_status = v_to, updated_at = pg_catalog.now() where id = v_batch;
  end if;

  insert into public.batch_status_history(batch_id, dimension, from_state, to_state, reason, actor_id)
  values (v_batch, 'lifecycle', b.lifecycle_status, v_to,
          case when v_to='qc_approved' and v_sod_conflict and v_allow_override then coalesce(v_reason,'') || ' [SoD override]' else v_reason end, v_actor);
  return jsonb_build_object('ok', true, 'from', b.lifecycle_status, 'to', v_to,
                            'sod_override', (v_to='qc_approved' and v_sod_conflict and v_allow_override),
                            'qc_revision', case when v_reopen then b.qc_revision + 1 else b.qc_revision end);
end $$;

revoke all on function public.record_qc(jsonb)                   from public, anon, authenticated;
revoke all on function public.record_design_validation(jsonb)    from public, anon, authenticated;
revoke all on function public.revoke_design_validation(jsonb)    from public, anon, authenticated;
revoke all on function public.advance_batch_lifecycle(jsonb)     from public, anon, authenticated;
grant execute on function public.record_qc(jsonb)                to service_role;
grant execute on function public.record_design_validation(jsonb) to service_role;
grant execute on function public.revoke_design_validation(jsonb) to service_role;
grant execute on function public.advance_batch_lifecycle(jsonb)  to service_role;
