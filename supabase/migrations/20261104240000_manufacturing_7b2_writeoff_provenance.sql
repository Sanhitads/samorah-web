-- ============================================================================
-- MANUFACTURING — Phase 7B-2 closing fix A.1: write-off ≠ verified provenance
-- ============================================================================
-- Still INERT. ADDITIVE (redefines two functions; apply_stock_movement untouched).
--
-- DEFECT (closure review A.1): dispose_exception_shortfall posted a MOVEMENT-BACKED writeoff overlay
-- referencing the original sale movement. That retroactively made the un-attributable (refunded) sale
-- look FULLY batch-attributed (overlay == delta) and flipped variant_batch_reconciliation to
-- fully_reconciled / activation_eligible — i.e. a SYNTHETIC accounting disposition was being read as
-- VERIFIED physical batch attribution. Wrong.
--
-- FIX: a refunded shortfall's physical write-off is now a MOVEMENT-LESS overlay entry (movement_id NULL,
-- entry_type 'writeoff'). It:
--   • removes the units from the named batch's physical on-hand (per-batch non-negativity still enforced),
--     restoring PHYSICAL conservation (aggregate stock == Σ all overlay) without a stock movement
--     (the original sale deduction is neither duplicated nor reversed; nothing saleable is increased);
--   • does NOT touch the sale movement's attribution, so the sale stays visibly un-attributed and the
--     attribution drift PERSISTS, now explained by a `resolved_written_off` exception (synthetic, flagged);
--   • NEVER fabricates a sale→batch provenance link or a batch_allocation; unknown origin that cannot be
--     tied to a real batch simply CANNOT be written off here (stays resolved_refunded, surfaced) — unknown
--     stays unknown.
-- Reconciliation v5 surfaces physical_consistent + written_off_qty and makes fully_reconciled /
-- activation_eligible require ZERO synthetic dispositions, so a write-off can never be mistaken for
-- verified manufacturing traceability. Activation stays additionally gated by the human legacy sign-off.
-- DO NOT activate or push/deploy.
-- ============================================================================

-- ── Reconciliation v5 — distinguish synthetic disposition from verified attribution ──
create or replace function public.variant_batch_reconciliation(p_variant_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  with v as (select tracking_state, tracked_at from public.variants where id = p_variant_id),
  ep as (select coalesce((select max(epoch_at) from public.variant_tracking_epochs where variant_id = p_variant_id), (select tracked_at from v)) as epoch_at),
  mv as (
    select coalesce(sum(m.quantity_delta),0)::int ledger_attributed
    from public.inventory_movements m, v, ep
    where m.variant_ref = p_variant_id and v.tracking_state = 'tracked'
      and ep.epoch_at is not null and m.created_at >= ep.epoch_at and m.movement_type <> 'opening_balance'
  ),
  ova as (select coalesce(sum(qty),0)::int q from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null),  -- VERIFIED (movement-backed) attribution
  ovall as (select coalesce(sum(qty),0)::int q from public.batch_stock_entries where variant_id = p_variant_id),                           -- ALL overlay incl. movement-less writeoffs = physical on-hand
  exo as (select coalesce(sum(shortfall_qty),0)::int q from public.order_inventory_exceptions
          where variant_id = p_variant_id and state in ('captured_unallocated','pending_reallocation','refund_required','refund_initiated')),
  exr as (select coalesce(sum(shortfall_qty),0)::int q from public.order_inventory_exceptions
          where variant_id = p_variant_id and state = 'resolved_refunded'),
  exw as (select coalesce(sum(shortfall_qty),0)::int q from public.order_inventory_exceptions
          where variant_id = p_variant_id and state = 'resolved_written_off'),
  lg as (select state from public.variant_legacy_reconciliation where variant_id = p_variant_id)
  select jsonb_build_object(
    'variant_id', p_variant_id,
    'tracked', (select tracking_state = 'tracked' from v),
    'aggregate_stock', (select coalesce(stock,0) from public.variants where id = p_variant_id),
    'ledger_attributed', mv.ledger_attributed,
    'overlay_attributed', ova.q,                 -- movement-backed (verified) attribution only
    'physical_onhand', ovall.q,                  -- all overlay (incl. synthetic writeoffs)
    'open_exception_qty', exo.q,
    'refunded_exception_qty', exr.q,
    'written_off_qty', exw.q,                    -- SYNTHETIC accounting dispositions (not verified provenance)
    'overlay_ledger_drift', ova.q - mv.ledger_attributed,
    -- Physical conservation: aggregate stock equals total batch on-hand (restored by a write-off).
    'physical_consistent', (select coalesce(stock,0) from public.variants where id = p_variant_id) = ovall.q,
    -- Every unit of the attribution drift is traceable to open + refunded + written-off exceptions.
    'accounting_explained', (ova.q - mv.ledger_attributed) = (exo.q + exr.q + exw.q),
    -- A synthetic write-off (exw) exists → NOT fully reconciled: the drift is explained but NOT verified-attributed.
    'has_synthetic_disposition', (exw.q > 0),
    -- COMPLETE verified reconciliation: zero drift, nothing open, nothing refunded-pending, NO synthetic write-off.
    'fully_reconciled', ((ova.q - mv.ledger_attributed) = 0 and exo.q = 0 and exr.q = 0 and exw.q = 0),
    -- Activation requires verified reconciliation (never a synthetic patch) AND the human legacy sign-off.
    'activation_eligible', ((ova.q - mv.ledger_attributed) = 0 and exo.q = 0 and exr.q = 0 and exw.q = 0 and (select state from lg) = 'reconciled')
  ) from mv, ova, ovall, exo, exr, exw;
$$;

-- ── dispose_exception_shortfall — MOVEMENT-LESS physical write-off (no verified-attribution claim) ──
create or replace function public.dispose_exception_shortfall(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'exception_id','')::uuid; v_batch uuid := nullif(p->>'batch_id','')::uuid;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
  e public.order_inventory_exceptions%rowtype; b public.manufacturing_batches%rowtype;
begin
  if v_id is null or v_batch is null then
    raise exception 'dispose_shortfall: exception_id and batch_id (the batch physically holding the units) required' using errcode = 'invalid_parameter_value';
  end if;
  select * into e from public.order_inventory_exceptions where id = v_id for update;
  if not found then raise exception 'dispose_shortfall: exception % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if e.state = 'resolved_written_off' then return jsonb_build_object('ok', true, 'already_disposed', true); end if;
  if e.state <> 'resolved_refunded' then
    raise exception 'dispose_shortfall: exception must be resolved_refunded first (financial evidence required), got %', e.state using errcode = 'check_violation';
  end if;
  perform 1 from public.variants where id = e.variant_id for update;
  select * into b from public.manufacturing_batches where id = v_batch for update;
  if not found or b.variant_id <> e.variant_id then
    raise exception 'dispose_shortfall: batch % does not belong to the exception variant', v_batch using errcode = 'check_violation';
  end if;
  -- MOVEMENT-LESS write-off: remove the refunded units from THIS batch's physical on-hand. No stock movement
  -- (aggregate variants.stock already excludes them from the original sale) and NO attribution of the sale
  -- to this batch — the sale stays un-attributed (drift persists, explained by this resolved_written_off
  -- exception). Per-batch non-negativity guarantees the batch actually held the units.
  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
  values (v_batch, e.variant_id, 'writeoff', -e.shortfall_qty, null, 'order', e.order_id,
          coalesce(v_reason, 'refunded shortfall physically written off (synthetic disposition — not verified sale provenance)'),
          v_actor, 'exc_writeoff:' || e.id::text);
  update public.order_inventory_exceptions
     set state = 'resolved_written_off', reason = coalesce(v_reason, reason), resolved_at = pg_catalog.now(), resolved_by = v_actor, updated_at = pg_catalog.now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'written_off', e.shortfall_qty, 'batch_id', v_batch, 'synthetic', true);
end $$;

revoke all on function public.variant_batch_reconciliation(uuid)       from public, anon, authenticated;
revoke all on function public.dispose_exception_shortfall(jsonb)        from public, anon, authenticated;
grant  execute on function public.variant_batch_reconciliation(uuid)    to service_role;
grant  execute on function public.dispose_exception_shortfall(jsonb)    to service_role;
