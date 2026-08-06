-- ============================================================================
-- Phase 1B-0b — Inbound receipt foundation (Returns + RTO physical receiving)
--
-- ADDITIVE ONLY. Migrations …16 / …17 / …18 are FROZEN and untouched. This adds the
-- unified inbound-receipt mechanism shared by two SEPARATE workflows (Returns and
-- Fulfillment/RTO each create receipts + call commit; the mechanism is shared, the
-- workflows stay distinct — no WMS). Foundation only: schema + commit RPC + invariants.
-- The live Returns auto-restock path is NOT changed here (that is 1B-1, shipped atomically).
--
-- Guarantees:
--   • per-receipt-item idempotent restock via the FROZEN apply_stock_movement (INV-4/9);
--   • aggregation-safe expected qty (SUM of source lines per variant);
--   • cross-receipt over-receipt prevention under concurrency (source row-lock);
--   • only restockable_qty moves stock; damaged is receipt/audit truth (no movement, D7);
--   • committed receipts are immutable (no UPDATE/DELETE grant on committed rows);
--   • Return vs RTO source lifecycle validated against the canonical state machines.
-- ============================================================================


-- ── Allow 'rto' as an inventory-movement source (rto_restock type already reserved in …16) ──
alter table public.inventory_movements drop constraint if exists inventory_movements_source_type_check;
alter table public.inventory_movements add  constraint inventory_movements_source_type_check
  check (source_type in ('admin','order','return','rto','system'));


-- ── inventory_receipts (header = one physical receiving event) ────────────────
create table public.inventory_receipts (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('return','rto')),
  source_id    uuid not null,                                   -- returns.id (return) | shipments.id (rto)
  status       text not null default 'draft' check (status in ('draft','committed','void')),
  note         text,
  received_by  uuid references public.users(id) on delete set null,
  received_at  timestamptz not null default now(),             -- physical receipt time
  committed_by uuid references public.users(id) on delete set null,
  committed_at timestamptz,                                     -- inventory commit time (may differ)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index inventory_receipts_source_idx on public.inventory_receipts(source_type, source_id);

-- ── inventory_receipt_items (per variant, per physical receipt) ───────────────
create table public.inventory_receipt_items (
  id                    uuid primary key default gen_random_uuid(),
  receipt_id            uuid not null references public.inventory_receipts(id) on delete cascade,
  variant_id            uuid references public.variants(id) on delete set null,   -- soft link
  variant_ref           uuid         not null,                                    -- immutable identity
  sku_snapshot          varchar(60)  not null,
  product_name_snapshot varchar(160) not null,
  variant_name_snapshot varchar(120),
  expected_qty          integer      not null check (expected_qty >= 0),          -- canonical SUM snapshot
  received_qty          integer      not null check (received_qty > 0),           -- a committed item = goods physically received (V3)
  restockable_qty       integer      not null default 0 check (restockable_qty >= 0),
  damaged_qty           integer      not null default 0 check (damaged_qty >= 0),
  disposition           text,                                                     -- optional label
  movement_id           uuid references public.inventory_movements(id) on delete set null,  -- set on commit
  created_at            timestamptz  not null default now(),
  -- every received unit is either restockable or damaged; and a single receipt can't exceed expected
  constraint receipt_item_qty_split         check (restockable_qty + damaged_qty = received_qty),
  constraint receipt_item_received_le_expct check (received_qty <= expected_qty),
  -- ONE line per variant per receipt — so the cumulative over-receipt check (committed prior + this item)
  -- is complete and two items for the same variant can't each pass individually and jointly over-receive (V1).
  constraint uq_receipt_item_variant        unique (receipt_id, variant_ref)
);
create index inventory_receipt_items_receipt_idx on public.inventory_receipt_items(receipt_id);
create index inventory_receipt_items_variant_idx on public.inventory_receipt_items(variant_ref);

alter table public.inventory_receipts      enable row level security;
alter table public.inventory_receipt_items enable row level security;
-- Server-managed. Draft rows are mutable by the service; committed rows are immutable — enforced by the
-- commit RPC + the guard trigger below (no UPDATE/DELETE bypass through the API for committed receipts).
grant select, insert, update, delete on public.inventory_receipts      to service_role;
grant select, insert, update, delete on public.inventory_receipt_items to service_role;


-- ── Immutability guard — a COMMITTED receipt (and its items) cannot be edited/deleted ─────────
create or replace function public.inventory_receipts_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A COMMITTED receipt is fully immutable. The commit transition itself is draft→committed (old='draft'),
  -- and draft→void is old='draft', so both pass; only edits/deletes to an already-committed row are blocked.
  if old.status = 'committed' then
    raise exception 'a committed receipt is immutable (compensate via a new inventory transaction)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger inventory_receipts_immutable_trg before update or delete on public.inventory_receipts
  for each row execute function public.inventory_receipts_immutable();

create or replace function public.inventory_receipt_items_immutable()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  -- commit_receipt sets movement_id on items while the header is still 'draft' (it flips to committed at
  -- the very end), so those writes pass. Once committed, the item is immutable — EXCEPT the catalog-delete
  -- cascade variant_id → NULL (ON DELETE SET NULL), which preserves the immutable snapshot + movement
  -- history (V5.1). Any quantity/snapshot/movement edit, a variant_id change to another value, or a delete
  -- is blocked (a snapshot alone must never re-authorise stock).
  select status into v_status from public.inventory_receipts where id = coalesce(old.receipt_id, new.receipt_id);
  if v_status = 'committed' then
    if tg_op = 'DELETE' then raise exception 'committed receipt items are immutable'; end if;
    if new.received_qty <> old.received_qty or new.restockable_qty <> old.restockable_qty
       or new.damaged_qty <> old.damaged_qty or new.expected_qty <> old.expected_qty
       or new.variant_ref <> old.variant_ref or new.sku_snapshot <> old.sku_snapshot
       or new.movement_id is distinct from old.movement_id
       or (new.variant_id is not null and new.variant_id is distinct from old.variant_id) then
      raise exception 'committed receipt items are immutable';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger inventory_receipt_items_immutable_trg before update or delete on public.inventory_receipt_items
  for each row execute function public.inventory_receipt_items_immutable();


-- ── commit_receipt — the ONE transactional receiving path (routes through apply_stock_movement) ──
create or replace function public.commit_receipt(p_receipt_id uuid, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  rec       public.inventory_receipts%rowtype;
  it        record;
  v_ref     text;
  v_expected int;
  v_prior    int;
  v_restocked int := 0;
begin
  select * into rec from public.inventory_receipts where id = p_receipt_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- Idempotent (D-0b-1): a repeat commit is an explicit no-op, creating no additional movement.
  if rec.status = 'committed' then return jsonb_build_object('ok', true, 'already_committed', true); end if;
  if rec.status <> 'draft'    then return jsonb_build_object('ok', false, 'reason', 'not_draft', 'status', rec.status); end if;

  -- Source lifecycle validation + LOCK the source (serialises concurrent receipts → over-receipt safe).
  if rec.source_type = 'return' then
    select rma_number into v_ref from public.returns where id = rec.source_id and status in ('received','inspection') for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'source_not_receivable'); end if;
  elsif rec.source_type = 'rto' then
    select o.order_number into v_ref
      from public.shipments s join public.orders o on o.id = s.order_id
      where s.id = rec.source_id and s.status = 'rto' for update of s;
    if not found then return jsonb_build_object('ok', false, 'reason', 'source_not_receivable'); end if;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_source_type');
  end if;

  -- An empty physical receipt cannot be committed (V2) — deterministic reject, stays draft.
  if not exists (select 1 from public.inventory_receipt_items where receipt_id = rec.id) then
    return jsonb_build_object('ok', false, 'reason', 'empty_receipt');
  end if;

  for it in select * from public.inventory_receipt_items where receipt_id = rec.id loop
    -- A draft item whose variant was deleted before commit cannot be committed (V5.2) — the snapshot alone
    -- must never authorise a new stock movement. Raise (rolls the whole commit back — receipt-level atomicity).
    if it.variant_id is null then
      raise exception 'variant_unavailable: receipt item % has no live variant', it.id using errcode = 'check_violation';
    end if;
    -- Canonical expected = SUM of the SOURCE lines for this variant (aggregation-safe: duplicate lines).
    if rec.source_type = 'return' then
      select coalesce(sum(quantity), 0) into v_expected
        from public.return_items where return_id = rec.source_id and variant_id = it.variant_id;
    else
      select coalesce(sum(oi.quantity), 0) into v_expected
        from public.order_items oi join public.shipments s on s.order_id = oi.order_id
        where s.id = rec.source_id and oi.variant_id = it.variant_id;
    end if;

    -- Cumulative received across ALREADY-COMMITTED receipts for this (source, variant).
    select coalesce(sum(rii.received_qty), 0) into v_prior
      from public.inventory_receipt_items rii
      join public.inventory_receipts r2 on r2.id = rii.receipt_id
      where r2.source_type = rec.source_type and r2.source_id = rec.source_id
        and r2.status = 'committed' and rii.variant_ref = it.variant_ref;

    if v_prior + it.received_qty > v_expected then
      raise exception 'over_receipt: variant % cumulative %+% > expected %', it.variant_ref, v_prior, it.received_qty, v_expected
        using errcode = 'check_violation';
    end if;

    -- Only restockable quantity increases sellable stock — via the FROZEN choke point, keyed per item.
    if it.restockable_qty > 0 and it.variant_id is not null then
      perform public.apply_stock_movement(
        it.variant_id, it.restockable_qty,
        case rec.source_type when 'return' then 'return_restock' else 'rto_restock' end,
        rec.source_type, rec.source_id,
        v_ref,                 -- p_reference (rma_number / order_number)
        p_actor_id,            -- p_actor_id
        null::text,            -- p_reason (system movement)
        null::text,            -- p_note
        jsonb_build_object('receipt_id', rec.id, 'receipt_item_id', it.id, 'damaged_qty', it.damaged_qty),  -- p_metadata
        (case rec.source_type when 'return' then 'return_receipt_item:' else 'rto_receipt_item:' end) || it.id::text  -- p_idempotency_key
      );
      update public.inventory_receipt_items set movement_id = (
        select id from public.inventory_movements
          where idempotency_key = (case rec.source_type when 'return' then 'return_receipt_item:' else 'rto_receipt_item:' end) || it.id::text
      ) where id = it.id;
      v_restocked := v_restocked + it.restockable_qty;
    end if;
  end loop;

  update public.inventory_receipts
     set status = 'committed', committed_by = p_actor_id, committed_at = now(), updated_at = now()
   where id = rec.id;

  return jsonb_build_object('ok', true, 'committed', true, 'restocked', v_restocked);
end $$;
revoke all on function public.commit_receipt(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.commit_receipt(uuid, uuid) to service_role;
