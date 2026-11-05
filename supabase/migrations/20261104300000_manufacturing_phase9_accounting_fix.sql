-- ============================================================================
-- MANUFACTURING — Phase 9 verification fixes (A.1 accounting semantics, A.3 containment-release hardening)
-- ============================================================================
-- INERT; apply_stock_movement unchanged; variants.stock never changed here. ADDITIVE. DO NOT activate/push/deploy.
--
-- A.1 clarity: batch_recall_accounting now reports PHYSICAL on-hand (Σ overlay = released − sold + returns −
--     written_off, proven from batch_stock_entries) separately from SELLABLE on-hand (0 for a recalled/held
--     batch — its physical units are NOT sellable). No overlapping cumulative metric is summed as physical
--     units. Conservation invariant (physical): released = physical_on_hand + sold_from_batch + written_off
--     − returns_restocked; unknown_qty flags anything unplaceable.
-- A.3 release hardening: release_batch_containment now requires the batch to be genuinely eligible again
--     (qc_approved + a current approved design validation) with an explicit reason/evidence, refuses while
--     ANY open case covers the batch, and NEVER creates sellable stock (it only clears recall_state; the
--     overlay/variants.stock are untouched, so sellability still depends on real on-hand).
-- ============================================================================

create or replace function public.batch_recall_accounting(p_batch_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  with b as (select * from public.manufacturing_batches where id = p_batch_id),
  rel  as (select coalesce(sum(qty),0)::int q from public.batch_release_events where batch_id = p_batch_id),
  onh  as (select public.batch_onhand(p_batch_id) q),
  alloc as (select coalesce(sum(qty),0)::int q from public.batch_allocations where batch_id = p_batch_id and state = 'allocated'),
  ship as (select coalesce(sum(qty),0)::int q from public.shipment_batch_lines where batch_id = p_batch_id),
  quar as (select coalesce(sum(qty),0)::int q from public.batch_quarantine where batch_id = p_batch_id and disposition = 'held'),
  ret  as (select coalesce(sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type in ('return_restock','rto_restock')),
  woff as (select coalesce(-sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type = 'writeoff'),
  sold as (select coalesce(-sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type = 'sale'),
  elig as (select ((select recall_state from b) = 'none') as e)
  select jsonb_build_object(
    'batch_id', (select id from b), 'batch_code', (select batch_code from b), 'recall_state', (select recall_state from b),
    'eligible', (select e from elig),
    'cumulative', jsonb_build_object(   -- lifetime production/transaction measures (NOT additive physical units)
      'produced', (select produced_qty from b), 'qc_rejected', (select rejected_qty from b),
      'qc_sampled_destroyed', (select qc_sampled_destroyed_qty from b), 'approved', (select approved_qty from b),
      'released', (select q from rel), 'sold_from_batch', (select q from sold), 'returns_restocked', (select q from ret)),
    'current', jsonb_build_object(      -- current distinct, non-overlapping buckets
      'physical_on_hand', (select q from onh),                                 -- Σ overlay = released − sold + returns − written_off
      'sellable_on_hand', case when (select e from elig) then (select q from onh) else 0 end,  -- 0 while recalled/held
      'allocated_unpicked', (select q from alloc),
      'in_fulfillment', greatest(0, (select q from sold) - (select q from ship)),
      'shipped', (select q from ship),
      'quarantined', (select q from quar)),
    'written_off_synthetic', (select q from woff),   -- synthetic accounting disposition (NOT verified consumption)
    -- Conservation (physical): released = physical_on_hand + sold_from_batch + written_off − returns.
    'unknown_qty', (select q from rel) - ((select q from onh) + (select q from sold) + (select q from woff) - (select q from ret)),
    'reconciled', ((select q from rel) - ((select q from onh) + (select q from sold) + (select q from woff) - (select q from ret))) = 0
  );
$$;

create or replace function public.release_batch_containment(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
        b public.manufacturing_batches%rowtype; v_fp text;
begin
  if v_batch is null or v_reason is null then raise exception 'release_containment: batch_id and reason/evidence required' using errcode='invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found then raise exception 'release_containment: batch % not found', v_batch using errcode='foreign_key_violation'; end if;
  -- refuse while ANY open recall/hold case still covers the batch (overlapping cases cannot be bypassed)
  if public.batch_open_recall_kind(v_batch) is not null then
    raise exception 'release_containment: batch is still covered by an OPEN recall/hold case' using errcode='check_violation';
  end if;
  if b.recall_state = 'none' then return jsonb_build_object('ok', true, 'already_eligible', true); end if;
  -- returning to eligibility requires the batch to be genuinely sellable-eligible again (QC + validation)
  if b.lifecycle_status <> 'qc_approved' then
    raise exception 'release_containment: batch is % — only a qc_approved batch may be returned to eligibility', b.lifecycle_status using errcode='check_violation';
  end if;
  v_fp := public.batch_config_fingerprint(v_batch);
  if not exists (select 1 from public.batch_design_validations where config_fingerprint = v_fp and result='pass' and state='approved') then
    raise exception 'release_containment: no current approved design validation — re-validate before returning to eligibility' using errcode='check_violation';
  end if;
  -- clears ONLY recall_state; variants.stock and overlay are untouched → creates NO sellable stock by itself.
  update public.manufacturing_batches set recall_state = 'none', updated_at = pg_catalog.now() where id = v_batch;
  insert into public.recall_case_events(recall_id, event, to_state, actor_id, notes)
  select rb.recall_id, 'batch_released', 'none', v_actor, coalesce(v_reason,'') from public.recall_case_batches rb where rb.batch_id = v_batch limit 1;
  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'recall_state', 'none');
end $$;

revoke all on function public.batch_recall_accounting(uuid)        from public, anon, authenticated;
revoke all on function public.release_batch_containment(jsonb)     from public, anon, authenticated;
grant  execute on function public.batch_recall_accounting(uuid)    to service_role;
grant  execute on function public.release_batch_containment(jsonb) to service_role;
