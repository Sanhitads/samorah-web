-- ============================================================================
-- Phase 1B-2 — RTO receiving closure boundary (shipment-anchored)
--
-- ADDITIVE ONLY. Frozen migrations …16/…17/…18/…19/…20 (files + functions) are UNTOUCHED. This wires
-- the RTO side of the shared inbound-receipt foundation, mirroring the Returns closure (…20) but anchored
-- on the SHIPMENT row. commit_receipt() remains the receiving authority; apply_stock_movement() the sole
-- stock choke point; nothing here writes variants.stock directly. shipments.status stays terminal 'rto'
-- (no rto_received/rto_inspected state) — physical receiving/closure is a separate inventory-accounting
-- concern tracked by the columns below (D-1B2-F).
--
-- What this adds (RTO analogue of …20, scoped to source_type='rto' only — Return path unchanged):
--   • shipments.rto_receiving_closed_at / rto_receiving_closed_by — the closure boundary (no scalar
--     shortage; final missing is DERIVED per variant from canonical expected − cumulative committed received).
--   • close_rto_receiving(shipment_id, actor) — authoritative closure txn. Locks the SHIPMENT row (the SAME
--     FOR UPDATE authority the frozen commit_receipt takes: '… s.status=''rto'' for update of s'), validates
--     status='rto', rejects when non-void draft RTO receipts still exist (no stranded drafts), idempotent
--     second close.
--   • commit_rto_receipt(receipt_id, actor) — the ONLY RTO-receipt commit path the app calls. Locks the
--     shipment row, refuses a closed shipment, then delegates to the frozen commit_receipt(). The shared
--     shipment-row lock serialises commit-vs-close.
--   • Two guard triggers scoped to source_type='rto' (no new receipt / no draft→committed after close).
--     They coexist with the frozen source_type='return' triggers — each returns early for the other's
--     source_type, so Return behaviour is unchanged.
-- ============================================================================


-- ── Closure boundary columns on shipments (shipments is NOT a frozen table) ───
alter table public.shipments add column if not exists rto_receiving_closed_at timestamptz;
alter table public.shipments add column if not exists rto_receiving_closed_by uuid references public.users(id) on delete set null;


-- ── Guard: no RTO receipt may be CREATED for a shipment whose RTO receiving is closed ──
create or replace function public.inventory_receipts_rto_closed_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_closed timestamptz;
begin
  if new.source_type <> 'rto' then return new; end if;   -- Return path untouched
  select rto_receiving_closed_at into v_closed from public.shipments where id = new.source_id;
  if v_closed is not null then
    raise exception 'rto_receiving_closed: cannot create a receipt for a shipment whose RTO receiving is closed'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger inventory_receipts_rto_closed_insert_trg
  before insert on public.inventory_receipts
  for each row execute function public.inventory_receipts_rto_closed_guard();


-- ── Guard: no RTO draft receipt may be COMMITTED for a closed shipment ─────────
-- Catches all-damaged receipts (no movement) and any direct commit_receipt() bypass of the wrapper.
create or replace function public.inventory_receipts_rto_closed_commit_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_closed timestamptz;
begin
  if new.source_type <> 'rto' then return new; end if;   -- Return path untouched
  if new.status = 'committed' and old.status is distinct from 'committed' then
    select rto_receiving_closed_at into v_closed from public.shipments where id = new.source_id;
    if v_closed is not null then
      raise exception 'rto_receiving_closed: cannot commit a receipt for a shipment whose RTO receiving is closed'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_receipts_rto_closed_commit_trg
  before update on public.inventory_receipts
  for each row execute function public.inventory_receipts_rto_closed_commit_guard();


-- ── close_rto_receiving — the authoritative closure transaction ────────────────
create or replace function public.close_rto_receiving(p_shipment_id uuid, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare rec public.shipments%rowtype;
begin
  -- Lock the SHIPMENT row — the SAME FOR UPDATE authority the frozen commit_receipt takes (…19:139-143).
  -- Serialises close against RTO receipt commit: whoever gets the lock first wins deterministically.
  select * into rec from public.shipments where id = p_shipment_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- Idempotent second close.
  if rec.rto_receiving_closed_at is not null then
    return jsonb_build_object('ok', true, 'already_closed', true);
  end if;

  -- RTO receiving is valid only in the terminal 'rto' logistics state.
  if rec.status <> 'rto' then
    return jsonb_build_object('ok', false, 'reason', 'not_rto', 'status', rec.status);
  end if;

  -- No stranded drafts: every RTO draft receipt must be committed or voided before closing.
  if exists (
    select 1 from public.inventory_receipts
     where source_type = 'rto' and source_id = p_shipment_id and status = 'draft'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'open_receipts');
  end if;

  update public.shipments
     set rto_receiving_closed_at = now(), rto_receiving_closed_by = p_actor_id, updated_at = now()
   where id = p_shipment_id;

  return jsonb_build_object('ok', true, 'closed', true);
end $$;
revoke all on function public.close_rto_receiving(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.close_rto_receiving(uuid, uuid) to service_role;


-- ── commit_rto_receipt — the ONLY RTO-receipt commit path the app calls ────────
create or replace function public.commit_rto_receipt(p_receipt_id uuid, p_actor_id uuid default null)
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
  if v_source_type <> 'rto' then
    return jsonb_build_object('ok', false, 'reason', 'not_an_rto_receipt');
  end if;

  -- Lock the shipment row (shared serialisation resource with close_rto_receiving).
  select rto_receiving_closed_at into v_closed from public.shipments where id = v_source_id for update;
  if v_closed is not null then
    return jsonb_build_object('ok', false, 'reason', 'rto_receiving_closed');
  end if;

  -- Delegate to the FROZEN authority (it re-locks the same shipment row, reentrant in this txn).
  return public.commit_receipt(p_receipt_id, p_actor_id);
end $$;
revoke all on function public.commit_rto_receipt(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.commit_rto_receipt(uuid, uuid) to service_role;
