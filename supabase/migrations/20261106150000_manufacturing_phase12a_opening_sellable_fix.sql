-- Phase 12A — CORRECTION: legacy opening must keep variants.stock = SELLABLE balance (data-integrity fix).
--
-- DEFECT (found in Phase-12A audit): reconcile_variant_opening (migration …140000) asserted
--   eligible + quarantine + unknown = variants.stock  and put the WHOLE physical count into variants.stock.
-- But the existing commerce architecture treats variants.stock as the AUTHORITATIVE SELLABLE balance:
--   reserve_stock computes available = variants.stock − Σ(active holds), and finalize_order consumes holds
--   by decrementing variants.stock. So quarantine + unknown units folded into variants.stock WOULD be offered
--   to customers and could be reserved/sold (then fail attribution). That is wrong.
--
-- CORRECTION (smallest additive change; single authoritative ledger preserved): the invariant is
--   variants.stock = eligible (verified SELLABLE). Quarantine and unknown units are HELD ASIDE — recorded in
--   the reconciliation sign-off as physical holds, NEVER added to variants.stock, the sellable overlay, or
--   availability. No batches/provenance are invented for unknown stock. The physical count is documented as
--   eligible + quarantine + unknown in the sign-off, but only `eligible` is sellable system stock.
create or replace function public.reconcile_variant_opening(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_variant uuid := nullif(p->>'variant_id','')::uuid;
  v_elig int := coalesce((p->>'eligible_qty')::int, 0);
  v_quar int := coalesce((p->>'quarantine_qty')::int, 0);
  v_unk  int := coalesce((p->>'unknown_qty')::int, 0);
  v_actor uuid := nullif(p->>'actor_id','')::uuid;
  v_stock int; v_sku text; v_product uuid; v_track text; v_lb uuid; v_short text;
begin
  if v_variant is null then raise exception 'reconcile_variant_opening: variant_id required' using errcode='invalid_parameter_value'; end if;
  if v_actor is null then raise exception 'reconcile_variant_opening: actor_id (authorisation) required' using errcode='check_violation'; end if;
  if v_elig < 0 or v_quar < 0 or v_unk < 0 then raise exception 'reconcile_variant_opening: quantities must be >= 0' using errcode='check_violation'; end if;

  perform 1 from public.variants where id = v_variant for update;             -- serialise the cutover boundary
  select stock, sku, product_id, tracking_state into v_stock, v_sku, v_product, v_track
    from public.variants where id = v_variant;
  if not found then raise exception 'reconcile_variant_opening: variant % not found', v_variant using errcode='no_data_found'; end if;
  if v_track = 'tracked' then raise exception 'reconcile_variant_opening: variant is already tracked (opening is pre-activation only)' using errcode='check_violation'; end if;

  -- Idempotent: an opening already exists → return it unchanged.
  if exists (select 1 from public.manufacturing_batches where variant_id = v_variant and batch_kind = 'legacy') then
    return jsonb_build_object('ok', true, 'already_opened', true, 'variant_id', v_variant);
  end if;

  -- AUTHORITATIVE INVARIANT: variants.stock is the SELLABLE balance, which must equal the verified eligible
  -- quantity. Quarantine + unknown are physically present but held aside — NOT sellable, NOT in variants.stock.
  if v_elig <> v_stock then
    raise exception 'reconcile_variant_opening: eligible (%) must equal variants.stock (%). variants.stock is the authoritative SELLABLE balance — set it to the verified sellable quantity before the cutover. Quarantine (%) and unknown (%) units are held aside and are NOT sellable stock.',
      v_elig, v_stock, v_quar, v_unk using errcode='check_violation';
  end if;
  if v_stock <= 0 then raise exception 'reconcile_variant_opening: no sellable opening stock (activate an empty variant directly)' using errcode='check_violation'; end if;

  v_short := upper(left(replace(v_variant::text,'-',''), 10));
  -- The SELLABLE stock → a typed LEGACY container (allocatable via the sign-off). QC counters stay 0; on-hand
  -- is the movement-less legacy_opening overlay, which sums to variants.stock (physical_consistent).
  insert into public.manufacturing_batches(variant_id, product_id, batch_kind, lifecycle_status, batch_code, sku_snapshot, planned_qty, produced_qty, approved_qty)
  values (v_variant, v_product, 'legacy', 'released', 'LEGACY-'||v_short, coalesce(v_sku,'LEGACY'), 0, 0, 0) returning id into v_lb;
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_lb, v_variant, 'legacy_opening', v_elig, null, 'system', v_variant, 'legacy opening: verified sellable', v_actor, 'legacy_open_elig:'||v_variant::text);

  -- Sign-off: eligible = sellable (in variants.stock); quarantine + unknown = held aside (NOT in stock).
  insert into public.variant_legacy_reconciliation(variant_id, verified_eligible_qty, quarantine_qty, unknown_qty, state, reconciled_by, reconciled_at)
  values (v_variant, v_elig, v_quar, v_unk, 'reconciled', v_actor, pg_catalog.now())
  on conflict (variant_id) do update set verified_eligible_qty = excluded.verified_eligible_qty,
    quarantine_qty = excluded.quarantine_qty, unknown_qty = excluded.unknown_qty, state = 'reconciled',
    reconciled_by = excluded.reconciled_by, reconciled_at = excluded.reconciled_at;

  return jsonb_build_object('ok', true, 'variant_id', v_variant, 'sellable', v_elig,
    'held_quarantine', v_quar, 'held_unknown', v_unk, 'legacy_batch', v_lb,
    'note', 'quarantine + unknown are held aside — never in variants.stock, availability, or the sellable overlay');
end $$;

revoke all on function public.reconcile_variant_opening(jsonb) from public, anon, authenticated;
grant  execute on function public.reconcile_variant_opening(jsonb) to service_role;
