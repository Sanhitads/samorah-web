-- ============================================================================
-- Phase 1B-1 — Return receiving closure boundary (authority cutover support)
--
-- ADDITIVE ONLY. Frozen migrations …16 / …17 / …18 / …19 (files + functions) are
-- UNTOUCHED. This adds the Return-side receiving-closure boundary on top of the frozen
-- inbound-receipt foundation. commit_receipt() remains the receiving authority and
-- apply_stock_movement() the stock choke point — nothing here mutates stock directly.
--
-- What this adds:
--   • returns.receiving_closed_at / receiving_closed_by — the closure boundary (no scalar shortage;
--     final missing is DERIVED per variant from canonical expected − cumulative committed received).
--   • close_return_receiving(return_id, actor) — the authoritative closure txn. Locks the RETURN row
--     (the SAME FOR UPDATE authority the frozen commit_receipt takes), validates receiving state,
--     rejects when non-void draft receipts still exist (no stranded drafts), idempotent second close.
--   • commit_return_receipt(receipt_id, actor) — the ONLY Return-receipt commit path the app calls.
--     Locks the return row, refuses a legacy-restocked return, refuses a closed return, then delegates
--     to the frozen commit_receipt(). The shared return-row lock serialises commit-vs-close.
--   • Two REQUIRED guard triggers (source_type='return' only; RTO untouched — that is 1B-2):
--       – no NEW receipt for a closed return;
--       – no draft→committed for a closed return (catches all-damaged receipts that mint no movement,
--         and any direct commit_receipt() call that bypasses the wrapper).
-- ============================================================================


-- ── Closure boundary columns on returns (returns is NOT a frozen table) ───────
alter table public.returns add column if not exists receiving_closed_at timestamptz;
alter table public.returns add column if not exists receiving_closed_by uuid references public.users(id) on delete set null;


-- ── Guard: a receipt cannot be CREATED for a return whose receiving is closed ─
create or replace function public.inventory_receipts_return_closed_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_closed timestamptz;
begin
  -- Scope strictly to Return receipts; RTO (source_type='rto') is out of scope (Phase 1B-2).
  if new.source_type <> 'return' then return new; end if;
  select receiving_closed_at into v_closed from public.returns where id = new.source_id;
  if v_closed is not null then
    raise exception 'receiving_closed: cannot create a receipt for a return whose receiving is closed'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger inventory_receipts_return_closed_insert_trg
  before insert on public.inventory_receipts
  for each row execute function public.inventory_receipts_return_closed_guard();


-- ── Guard: a draft receipt cannot be COMMITTED for a closed return ────────────
-- Fires on the draft→committed transition. Catches all-damaged receipts (which write no movement,
-- so a movement-level guard would miss them) and any direct commit_receipt() bypass of the wrapper.
create or replace function public.inventory_receipts_return_closed_commit_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_closed timestamptz;
begin
  if new.source_type <> 'return' then return new; end if;
  if new.status = 'committed' and old.status is distinct from 'committed' then
    select receiving_closed_at into v_closed from public.returns where id = new.source_id;
    if v_closed is not null then
      raise exception 'receiving_closed: cannot commit a receipt for a return whose receiving is closed'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_receipts_return_closed_commit_trg
  before update on public.inventory_receipts
  for each row execute function public.inventory_receipts_return_closed_commit_guard();


-- ── close_return_receiving — the authoritative closure transaction ────────────
create or replace function public.close_return_receiving(p_return_id uuid, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare rec public.returns%rowtype;
begin
  -- Lock the RETURN row — the SAME FOR UPDATE authority the frozen commit_receipt takes (…19:137).
  -- This serialises close against receipt commit: whoever gets the lock first wins deterministically.
  select * into rec from public.returns where id = p_return_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- Idempotent second close (V/case 18).
  if rec.receiving_closed_at is not null then
    return jsonb_build_object('ok', true, 'already_closed', true);
  end if;

  -- Close only from the canonical physical receiving window commit_receipt itself accepts.
  if rec.status not in ('received', 'inspection') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_state', 'status', rec.status);
  end if;

  -- No stranded drafts: every draft receipt must be committed or voided before closing.
  if exists (
    select 1 from public.inventory_receipts
     where source_type = 'return' and source_id = p_return_id and status = 'draft'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'open_receipts');
  end if;

  update public.returns
     set receiving_closed_at = now(), receiving_closed_by = p_actor_id, updated_at = now()
   where id = p_return_id;

  return jsonb_build_object('ok', true, 'closed', true);
end $$;
revoke all on function public.close_return_receiving(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.close_return_receiving(uuid, uuid) to service_role;


-- ── commit_return_receipt — the ONLY Return-receipt commit path the app calls ─
-- Wraps the frozen commit_receipt() with the return-row lock + legacy + closure authority.
create or replace function public.commit_return_receipt(p_receipt_id uuid, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_source_type text;
  v_source_id   uuid;
  v_closed      timestamptz;
begin
  select source_type, source_id into v_source_type, v_source_id
    from public.inventory_receipts where id = p_receipt_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_source_type <> 'return' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_return_receipt');
  end if;

  -- Legacy-restock defense (kept even though the hosted census is clean): if the OLD path already
  -- restocked this return (movement key 'return:<return_id>:%'), refuse receipt-driven restock.
  if exists (
    select 1 from public.inventory_movements
     where source_type = 'return' and movement_type = 'return_restock'
       and idempotency_key like 'return:' || v_source_id::text || ':%'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'legacy_restocked');
  end if;

  -- Lock the return row (shared serialisation resource with close_return_receiving).
  select receiving_closed_at into v_closed from public.returns where id = v_source_id for update;
  if v_closed is not null then
    return jsonb_build_object('ok', false, 'reason', 'receiving_closed');
  end if;

  -- Delegate to the FROZEN authority (it re-locks the same return row, reentrant in this txn).
  return public.commit_receipt(p_receipt_id, p_actor_id);
end $$;
revoke all on function public.commit_return_receipt(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.commit_return_receipt(uuid, uuid) to service_role;
