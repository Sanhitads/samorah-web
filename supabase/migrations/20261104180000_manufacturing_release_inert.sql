-- ============================================================================
-- MANUFACTURING — Phase 6B: INERT batch-release machinery (ADDITIVE)
-- ============================================================================
-- Installs the batch-release RPC + attribution invariants in an INERT state:
-- release is refused for every live variant (none is 'tracked'), and a global
-- kill-switch (manufacturing_settings.release_enabled) fails CLOSED. NO live
-- sellable stock is increased by this migration; checkout/payment/allocation are
-- untouched. apply_stock_movement is reused UNCHANGED as the only aggregate writer.
--
-- ONE justified change to an existing inventory table (NOT a function): the
-- inventory_movements movement_type/source_type CHECKs are widened (additive
-- superset) so release can post through apply_stock_movement — mirrors exactly how
-- 20260819120000 added 'rto'. Existing values remain valid; no behaviour changes.
-- DO NOT apply to production without separate approval. DO NOT enable tracking.
-- ============================================================================

-- ── 1. Additive CHECK widening on inventory_movements (justified; required) ───
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check (movement_type in ('opening_balance','manual_adjustment','sale','cancel_restock','return_restock','rto_restock','batch_release'));
alter table public.inventory_movements drop constraint if exists inventory_movements_source_type_check;
alter table public.inventory_movements add constraint inventory_movements_source_type_check
  check (source_type in ('admin','order','return','rto','system','batch'));

-- ── 2. tracking_state gains 'transition_pending' (reconciliation window) ──────
alter table public.variants drop constraint if exists variants_tracking_state_check;
alter table public.variants add constraint variants_tracking_state_check
  check (tracking_state in ('untracked','transition_pending','tracked'));

-- ── 3. Activation switches — two INDEPENDENT kill-switches (singleton) ────────
create table if not exists public.manufacturing_settings (
  id                 boolean primary key default true check (id),
  release_enabled    boolean not null default true,   -- emergency disable => release_batch fails CLOSED (no stock posted)
  allocation_enabled boolean not null default false,  -- Phase 7 (sale-path attribution); stays off here
  updated_at         timestamptz not null default now()
);
insert into public.manufacturing_settings (id) values (true) on conflict (id) do nothing;
alter table public.manufacturing_settings enable row level security;
grant select, insert, update on public.manufacturing_settings to service_role;

-- ── 4. Legacy classification (first-class concepts; inert until Phase 7) ──────
-- Distinguishes historical accounting balance from what is actually SELLABLE.
create table if not exists public.variant_legacy_reconciliation (
  variant_id          uuid primary key references public.variants(id) on delete restrict,
  accounting_balance  integer not null default 0,   -- Σ unoverlaid historical deltas (NOT proof of sellable)
  verified_eligible_qty integer not null default 0, -- explicitly verified sellable legacy
  quarantined_qty     integer not null default 0,
  unknown_qty         integer not null default 0,
  state               text not null default 'draft' check (state in ('draft','reconciled','activated')),
  notes               text,
  reconciled_by       uuid references public.users(id) on delete set null,
  reconciled_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint vlr_nonneg check (verified_eligible_qty >= 0 and quarantined_qty >= 0 and unknown_qty >= 0)
);
alter table public.variant_legacy_reconciliation enable row level security;
grant select, insert, update on public.variant_legacy_reconciliation to service_role;

-- ── 5. batch_release_events: record the approved QC revision released against ─
alter table public.batch_release_events add column if not exists qc_revision integer;

-- ── 6. Attribution invariants enforced AT THE DB (not just reconciliation) ────
-- (a) Overlay row must match its batch's variant, and (if it mirrors a movement) the
--     movement's variant + delta SIGN. Duplicate attribution is already blocked by the
--     unique(movement_id,batch_id) index. (b) Per-batch on-hand can never go negative.
create or replace function public.tg_batch_overlay_consistency()
returns trigger language plpgsql
set search_path = ''
as $$
declare v_bvar uuid; v_mvar uuid; v_mdelta integer;
begin
  select variant_id into v_bvar from public.manufacturing_batches where id = new.batch_id;
  if v_bvar is null then raise exception 'overlay: batch % not found', new.batch_id using errcode = 'foreign_key_violation'; end if;
  if new.variant_id <> v_bvar then
    raise exception 'overlay: variant % does not match batch variant %', new.variant_id, v_bvar using errcode = 'check_violation';
  end if;
  if new.movement_id is not null then
    select variant_ref, quantity_delta into v_mvar, v_mdelta from public.inventory_movements where id = new.movement_id;
    if new.variant_id <> v_mvar then
      raise exception 'overlay: variant % does not match movement variant %', new.variant_id, v_mvar using errcode = 'check_violation';
    end if;
    if new.qty <> 0 and sign(new.qty) <> sign(v_mdelta) then
      raise exception 'overlay: qty sign must match movement delta sign' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_batch_overlay_consistency on public.batch_stock_entries;
create trigger trg_batch_overlay_consistency before insert on public.batch_stock_entries
  for each row execute function public.tg_batch_overlay_consistency();

create or replace function public.tg_batch_overlay_nonneg()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if (select coalesce(sum(qty), 0) from public.batch_stock_entries where batch_id = new.batch_id) < 0 then
    raise exception 'overlay: per-batch on-hand would go negative for batch %', new.batch_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_batch_overlay_nonneg on public.batch_stock_entries;
create trigger trg_batch_overlay_nonneg after insert on public.batch_stock_entries
  for each row execute function public.tg_batch_overlay_nonneg();

-- (c) approved_qty can never drop below what has already been released.
create or replace function public.tg_batch_approved_floor()
returns trigger language plpgsql
set search_path = ''
as $$
declare v_released integer;
begin
  if new.approved_qty <> old.approved_qty then
    select coalesce(sum(qty), 0) into v_released from public.batch_release_events where batch_id = new.id;
    if new.approved_qty < v_released then
      raise exception 'approved_qty (%) cannot drop below already-released (%)', new.approved_qty, v_released using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_batch_approved_floor on public.manufacturing_batches;
create trigger trg_batch_approved_floor before update on public.manufacturing_batches
  for each row execute function public.tg_batch_approved_floor();

-- ── 7. release_batch — the ONLY path that posts a batch release ───────────────
-- Idempotency is checked BEFORE eligibility: a repeated key returns the original result
-- with no new movement; a reused key with different input is a conflict; only a genuinely
-- new request is evaluated against current QC/hold/validation/balance. INERT: refuses
-- unless the variant is 'tracked' AND release_enabled — no live variant is tracked.
create or replace function public.release_batch(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid := nullif(p->>'batch_id','')::uuid; v_qty int := (p->>'qty')::int;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; v_idem text := nullif(p->>'idempotency_key','');
  b public.manufacturing_batches%rowtype; ev public.batch_release_events%rowtype;
  v_released int; v_seq int; v_enabled boolean; v_tracking text; v_fp text; v_event_id uuid; v_mv jsonb; v_mid uuid; v_seid uuid;
begin
  if v_batch_id is null or v_qty is null then
    raise exception 'release_batch: batch_id and qty required' using errcode = 'invalid_parameter_value';
  end if;

  -- 1) Idempotency FIRST — before any eligibility evaluation.
  if v_idem is not null then
    select * into ev from public.batch_release_events where idempotency_key = v_idem;
    if found then
      if ev.batch_id <> v_batch_id or ev.qty <> v_qty then
        raise exception 'release_batch: idempotency key % reused with different input', v_idem using errcode = 'unique_violation';
      end if;
      return jsonb_build_object('ok', true, 'idempotent', true, 'event_id', ev.id, 'movement_id', ev.movement_id, 'released_qty', ev.qty);
    end if;
  end if;

  -- 2) Lock the batch; evaluate CURRENT eligibility.
  select * into b from public.manufacturing_batches where id = v_batch_id for update;
  if not found then raise exception 'release_batch: batch % not found', v_batch_id using errcode = 'foreign_key_violation'; end if;

  select release_enabled into v_enabled from public.manufacturing_settings where id = true;
  if not coalesce(v_enabled, false) then raise exception 'release_batch: releases are disabled' using errcode = 'check_violation'; end if;

  select tracking_state into v_tracking from public.variants where id = b.variant_id;
  if v_tracking <> 'tracked' then raise exception 'release_batch: variant is % — batch release is inert until the variant is tracked', v_tracking using errcode = 'check_violation'; end if;

  if b.lifecycle_status <> 'qc_approved' then raise exception 'release_batch: batch is % (needs qc_approved)', b.lifecycle_status using errcode = 'check_violation'; end if;
  if b.recall_state <> 'none' then raise exception 'release_batch: batch is on hold/recalled' using errcode = 'check_violation'; end if;
  if b.approved_at is null then raise exception 'release_batch: no current QC approval' using errcode = 'check_violation'; end if;

  v_fp := public.batch_config_fingerprint(v_batch_id);
  if not exists (select 1 from public.batch_design_validations where config_fingerprint = v_fp and result = 'pass' and state = 'approved') then
    raise exception 'release_batch: an approved design validation for the current configuration is required' using errcode = 'check_violation';
  end if;

  if v_qty <= 0 then raise exception 'release_batch: qty must be > 0' using errcode = 'invalid_parameter_value'; end if;
  select coalesce(sum(qty), 0) into v_released from public.batch_release_events where batch_id = v_batch_id;
  if v_released + v_qty > b.approved_qty then
    raise exception 'release_batch: releasing % would exceed approved % (already released %)', v_qty, b.approved_qty, v_released using errcode = 'check_violation';
  end if;

  -- 3) Atomic: event → ONE authoritative movement → attribution overlay.
  select coalesce(max(release_seq), 0) + 1 into v_seq from public.batch_release_events where batch_id = v_batch_id;
  insert into public.batch_release_events(batch_id, release_seq, qty, idempotency_key, released_by, qc_revision)
  values (v_batch_id, v_seq, v_qty, v_idem, v_actor, b.qc_revision)
  returning id into v_event_id;   -- the cap trigger re-checks Σ ≤ approved under the batch lock

  v_mv := public.apply_stock_movement(
    b.variant_id, v_qty, 'batch_release', 'batch', v_batch_id, b.batch_code,
    v_actor, null, null, jsonb_build_object('release_event_id', v_event_id), 'batch_release:' || v_event_id::text);
  v_mid := (select id from public.inventory_movements where idempotency_key = 'batch_release:' || v_event_id::text);

  insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, metadata, idempotency_key)
  values (v_batch_id, b.variant_id, 'release', v_qty, v_mid, 'batch', v_batch_id, b.batch_code, v_actor, jsonb_build_object('release_event_id', v_event_id), 'rel_overlay:' || v_event_id::text)
  returning id into v_seid;

  update public.batch_release_events set movement_id = v_mid, stock_entry_id = v_seid where id = v_event_id;

  -- 4) In-transaction reconciliation: overlay for this movement MUST equal its delta.
  if (select coalesce(sum(qty), 0) from public.batch_stock_entries where movement_id = v_mid) <> v_qty then
    raise exception 'release_batch: overlay/movement reconciliation mismatch' using errcode = 'check_violation';
  end if;

  -- Release is recorded in batch_release_events (authoritative) + the audit log; it is NOT a
  -- lifecycle/recall transition, so batch_status_history is intentionally not written here.

  return jsonb_build_object('ok', true, 'created', true, 'event_id', v_event_id, 'movement_id', v_mid,
                            'released_qty', v_qty, 'total_released', v_released + v_qty, 'approved_qty', b.approved_qty);
end $$;

revoke all on function public.release_batch(jsonb)                   from public, anon, authenticated;
revoke all on function public.tg_batch_overlay_consistency()         from public, anon, authenticated;
revoke all on function public.tg_batch_overlay_nonneg()              from public, anon, authenticated;
revoke all on function public.tg_batch_approved_floor()              from public, anon, authenticated;
grant execute on function public.release_batch(jsonb)                to service_role;
