-- ============================================================================
-- MANUFACTURING — Phase 7B-2 (part 2): batch-aware RETURNS, RTO & REFUND recovery
-- ============================================================================
-- Still INERT (no live tracked variant; both switches default disabled). ADDITIVE.
-- Completes the three remaining Phase 7B-2 workflows left fail-closed by part 1:
--   • B  Batch-aware customer returns  — restockable units are attributed back to their
--        ORIGINATING batches from recorded provenance (batch_allocations). Only genuinely
--        resale-eligible units of an ELIGIBLE batch re-enter sellable stock; recalled/held,
--        ambiguous and unknown-origin units are routed to a non-sellable disposition.
--   • C  Batch-aware RTO receiving    — identical attribution, anchored on the shipment.
--   • D  Refund-based exception recovery — links an order_inventory_exception to confirmed
--        refund EVIDENCE in the existing refunds ledger (no second financial ledger); issues
--        NO positive inventory movement (shortfall units were never deducted).
--
-- ONE existing inventory function changes: commit_receipt() (the single receiving authority)
-- gains a TRACKED branch in its item loop — reproduced verbatim, UNTRACKED path byte-identical.
-- Justified exactly as cancel_order was in 7B-1: a tracked restock must be batch-attributed or it
-- fails closed at commit; the frozen function unconditionally restocks the full quantity, which
-- would wrongly make recalled units sellable, so the split must happen where the movement is sized.
--
-- A.1 hardening: a tracked movement's created_at is pinned to now() on insert, so a privileged
-- backdated insert cannot slip a post-activation movement under the epoch to dodge attribution.
-- apply_stock_movement is UNCHANGED. DO NOT activate tracking or push/deploy.
-- ============================================================================

-- ── A.1 close the epoch-backdate bypass (defence in depth) ───────────────────
-- The deferred attribution constraint exempts movements with created_at < epoch. created_at is
-- client-suppliable on a direct privileged insert, so pin it to now() for TRACKED variants — a
-- post-activation movement can no longer be backdated under the epoch. Untracked: untouched.
create or replace function public.tg_movement_no_backdate()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if (select tracking_state from public.variants where id = new.variant_ref) = 'tracked' then
    new.created_at := pg_catalog.now();
  end if;
  return new;
end $$;
drop trigger if exists trg_movement_no_backdate on public.inventory_movements;
create trigger trg_movement_no_backdate before insert on public.inventory_movements
  for each row execute function public.tg_movement_no_backdate();

-- ── Additive: overlay entry_type gains 'rto_restock' (mirrors …18 widening inventory_movements) ──
alter table public.batch_stock_entries drop constraint if exists batch_stock_entries_entry_type_check;
alter table public.batch_stock_entries add constraint batch_stock_entries_entry_type_check
  check (entry_type in
    ('legacy_opening','release','sale','return_restock','rto_restock','cancel_restock',
     'recall_out','recall_restore','substitution_in','substitution_out','writeoff',
     'quarantine_out','quarantine_release'));

-- ── Durable pending-attribution hold (received, verified resale-eligible, but NOT yet sellable) ──
-- Records tracked restockable units that cannot be SAFELY and UNAMBIGUOUSLY attributed to an
-- eligible originating batch from recorded provenance alone (Phase 8 pick/pack scan not built):
--   unknown_origin   — no recorded batch_allocations for this order/variant;
--   recall_ambiguous — order shipped from several batches incl. a recalled/held one;
--   over_provenance  — restockable exceeded recorded shipped-minus-already-returned provenance.
-- These units are physically in hand but NOT in sellable stock and NOT in any batch overlay — a
-- fail-safe limbo awaiting manual (or future scan-driven) batch attribution. NEVER invents a batch.
create table if not exists public.batch_receipt_holds (
  id              uuid primary key default gen_random_uuid(),
  receipt_id      uuid references public.inventory_receipts(id) on delete restrict,
  receipt_item_id uuid references public.inventory_receipt_items(id) on delete restrict,
  variant_id      uuid not null references public.variants(id) on delete restrict,
  order_id        uuid references public.orders(id) on delete restrict,
  qty             integer not null check (qty > 0),
  kind            text not null check (kind in ('unknown_origin','recall_ambiguous','over_provenance')),
  reason          text,
  state           text not null default 'held'
                    check (state in ('held','resolved_restocked','resolved_quarantined','resolved_writeoff')),
  resolved_by     uuid references public.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists brh_open_idx on public.batch_receipt_holds(variant_id) where state = 'held';
create index if not exists brh_order_idx on public.batch_receipt_holds(order_id);
alter table public.batch_receipt_holds enable row level security;
grant select, insert, update on public.batch_receipt_holds to service_role;

-- ── D: durable link from an exception to its refund evidence (no second financial ledger) ────
alter table public.order_inventory_exceptions
  add column if not exists refund_id uuid references public.refunds(id) on delete set null;

-- ── B+C: batch-aware receiving attribution (shared helper, called within commit_receipt's txn) ──
-- Splits a tracked receipt item's restockable quantity using RECORDED provenance only:
--   • all candidate batches eligible → restock FIFO, each capped at shipped−already_returned; the
--     attributed total is posted as ONE sellable movement + exact per-batch overlay; residue held;
--   • exactly one candidate and it is recalled/held → quarantine to that (known) batch; 0 sellable;
--   • several candidates incl. a recalled/held one → hold all (ambiguous; fail-safe); 0 sellable;
--   • no recorded provenance → hold all (unknown origin; never invent a batch); 0 sellable.
-- Returns {restocked, held, quarantined, movement_id}. Held/recalled units can NEVER become sellable.
create or replace function public.attribute_receipt_restock(
  p_receipt_id uuid, p_receipt_item_id uuid, p_variant uuid, p_order uuid,
  p_movement_type text, p_src_type text, p_src_id uuid, p_reference text, p_actor uuid, p_restockable int)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry text := case p_movement_type when 'rto_restock' then 'rto_restock' else 'return_restock' end;
  v_cand int := 0; v_blocked boolean := false; v_single_blocked uuid;
  vb record; v_cap int; v_take int; v_remaining int := p_restockable; v_attributed int := 0;
  v_bids uuid[] := '{}'; v_bq int[] := '{}'; v_mid uuid; i int; v_key text;
begin
  if p_order is null then
    -- No source order to derive provenance from → cannot attribute → hold (never invent).
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'unknown_origin',
            'no source order resolved for this receipt; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;

  -- Candidate originating batches = what THIS order shipped for THIS variant (recorded provenance).
  for vb in
    select ba.batch_id as bid, b.recall_state as rs
      from public.batch_allocations ba
      join public.manufacturing_batches b on b.id = ba.batch_id
     where ba.order_id = p_order and ba.variant_id = p_variant
       and ba.state in ('allocated','picked','shipped','returned')
     group by ba.batch_id, b.recall_state
  loop
    v_cand := v_cand + 1;
    if vb.rs <> 'none' then v_blocked := true; v_single_blocked := vb.bid; end if;
  end loop;

  -- No recorded provenance → unknown origin → hold (never invent a batch).
  if v_cand = 0 then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'unknown_origin',
            'no recorded batch provenance for this order/variant; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;

  -- Exactly one candidate and it is recalled/held → quarantine to that KNOWN batch (never sellable).
  if v_cand = 1 and v_blocked then
    insert into public.batch_quarantine(batch_id, variant_id, qty, reason, actor_id)
    values (v_single_blocked, p_variant, p_restockable, 'returned units of a recalled/held batch', p_actor);
    return jsonb_build_object('restocked', 0, 'quarantined', p_restockable, 'movement_id', null);
  end if;

  -- Several candidates incl. a recalled/held one → cannot tell which unit → hold all (fail-safe).
  if v_blocked then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, p_restockable, 'recall_ambiguous',
            'order shipped from multiple batches including a recalled/held one; manual batch attribution required');
    return jsonb_build_object('restocked', 0, 'held', p_restockable, 'movement_id', null);
  end if;

  -- All candidates eligible → attribute FIFO, each capped at shipped − already-return-attributed.
  for vb in
    select ba.batch_id as bid,
           sum(ba.qty)::int as shipped,
           coalesce((select sum(bse.qty)::int from public.batch_stock_entries bse
                      where bse.batch_id = ba.batch_id and bse.variant_id = p_variant
                        and bse.source_id = p_order and bse.entry_type in ('return_restock','rto_restock')), 0) as already_ret,
           b.manufacturing_date as mdate, b.production_sequence as pseq
      from public.batch_allocations ba
      join public.manufacturing_batches b on b.id = ba.batch_id
     where ba.order_id = p_order and ba.variant_id = p_variant
       and ba.state in ('allocated','picked','shipped','returned')
     group by ba.batch_id, b.manufacturing_date, b.production_sequence
     order by b.manufacturing_date asc, b.production_sequence asc, ba.batch_id asc
  loop
    exit when v_remaining <= 0;
    v_cap := vb.shipped - vb.already_ret;
    if v_cap <= 0 then continue; end if;
    v_take := least(v_remaining, v_cap);
    v_bids := v_bids || vb.bid; v_bq := v_bq || v_take;
    v_remaining := v_remaining - v_take; v_attributed := v_attributed + v_take;
  end loop;

  -- Post ONE sellable movement for the attributed total (if any) + exact per-batch overlay.
  if v_attributed > 0 then
    v_key := (case p_movement_type when 'rto_restock' then 'rto_receipt_item:' else 'return_receipt_item:' end) || p_receipt_item_id::text;
    perform public.apply_stock_movement(p_variant, v_attributed, p_movement_type, p_src_type, p_src_id,
      p_reference, p_actor, null, null,
      jsonb_build_object('receipt_id', p_receipt_id, 'receipt_item_id', p_receipt_item_id, 'batch_aware', true), v_key);
    v_mid := (select id from public.inventory_movements where idempotency_key = v_key);
    for i in 1 .. array_length(v_bids, 1) loop
      insert into public.batch_stock_entries(batch_id, variant_id, entry_type, qty, movement_id, source_type, source_id, reference, actor_id, idempotency_key)
      values (v_bids[i], p_variant, v_entry, v_bq[i], v_mid, 'order', p_order, p_reference, p_actor,
              'ret_overlay:' || v_mid::text || ':' || v_bids[i]::text);
    end loop;
    update public.inventory_receipt_items set movement_id = v_mid where id = p_receipt_item_id;
  end if;

  -- Residue beyond recorded per-batch provenance → durable hold (over-return vs provenance).
  if v_remaining > 0 then
    insert into public.batch_receipt_holds(receipt_id, receipt_item_id, variant_id, order_id, qty, kind, reason)
    values (p_receipt_id, p_receipt_item_id, p_variant, p_order, v_remaining, 'over_provenance',
            'restockable exceeded recorded shipped-minus-returned provenance; manual batch attribution required');
  end if;

  return jsonb_build_object('restocked', v_attributed, 'held', v_remaining, 'movement_id', v_mid);
end $$;

-- ── commit_receipt — reproduced VERBATIM from 20260819120000 + a TRACKED branch ──────────────
-- Untracked receiving is byte-identical (single apply_stock_movement of restockable_qty). Tracked
-- receiving routes through attribute_receipt_restock: only eligible, unambiguously-attributable
-- units re-enter sellable stock; everything else is quarantined or held (never sellable).
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
  v_order    uuid;       -- source order (provenance anchor) for tracked attribution
  v_mtype    text;       -- return_restock | rto_restock
  v_attr     jsonb;      -- tracked attribution result
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
    select order_id into v_order from public.returns where id = rec.source_id;
    v_mtype := 'return_restock';
  elsif rec.source_type = 'rto' then
    select o.order_number into v_ref
      from public.shipments s join public.orders o on o.id = s.order_id
      where s.id = rec.source_id and s.status = 'rto' for update of s;
    if not found then return jsonb_build_object('ok', false, 'reason', 'source_not_receivable'); end if;
    select order_id into v_order from public.shipments where id = rec.source_id;
    v_mtype := 'rto_restock';
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
      if (select tracking_state from public.variants where id = it.variant_id) = 'tracked' then
        -- TRACKED (Phase 7B-2): batch-attributed restock; ineligible/ambiguous/unknown → quarantine/hold.
        v_attr := public.attribute_receipt_restock(
          rec.id, it.id, it.variant_id, v_order, v_mtype, rec.source_type, rec.source_id, v_ref, p_actor_id, it.restockable_qty);
        v_restocked := v_restocked + coalesce((v_attr->>'restocked')::int, 0);
      else
        -- UNTRACKED (all production today): byte-identical to the frozen receiving path.
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
    end if;
  end loop;

  update public.inventory_receipts
     set status = 'committed', committed_by = p_actor_id, committed_at = now(), updated_at = now()
   where id = rec.id;

  return jsonb_build_object('ok', true, 'committed', true, 'restocked', v_restocked);
end $$;

-- ── D: resolve an order inventory exception from CONFIRMED refund evidence ─────────────────────
-- Links the exception to a refund row on the SAME order (the refunds ledger is the financial truth;
-- no second ledger). Issues NO positive inventory movement — the shortfall units were never deducted
-- from any batch, so there is nothing to restore. processed ⇒ resolved_refunded (fulfilment unblocks);
-- any other non-failed status ⇒ refund_initiated (still open, fulfilment stays blocked); failed ⇒ reject.
create or replace function public.resolve_exception_by_refund(p jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'exception_id','')::uuid; v_refund uuid := nullif(p->>'refund_id','')::uuid;
  v_actor uuid := nullif(p->>'actor_id','')::uuid; e public.order_inventory_exceptions%rowtype;
  r public.refunds%rowtype; v_to text;
begin
  if v_id is null or v_refund is null then
    raise exception 'resolve_by_refund: exception_id and refund_id required' using errcode = 'invalid_parameter_value';
  end if;
  select * into e from public.order_inventory_exceptions where id = v_id for update;
  if not found then raise exception 'resolve_by_refund: exception % not found', v_id using errcode = 'foreign_key_violation'; end if;
  if e.state in ('resolved_allocated','resolved_refunded') then
    return jsonb_build_object('ok', true, 'already_resolved', true, 'state', e.state);
  end if;
  select * into r from public.refunds where id = v_refund;
  if not found then raise exception 'resolve_by_refund: refund % not found', v_refund using errcode = 'foreign_key_violation'; end if;
  if r.order_id <> e.order_id then raise exception 'resolve_by_refund: refund belongs to a different order' using errcode = 'check_violation'; end if;
  if r.status = 'failed' then raise exception 'resolve_by_refund: refund is failed — not valid evidence' using errcode = 'check_violation'; end if;

  v_to := case when r.status = 'processed' then 'resolved_refunded' else 'refund_initiated' end;
  update public.order_inventory_exceptions
     set state = v_to, refund_id = v_refund,
         reason = coalesce(nullif(p->>'reason',''), reason),
         resolved_at = case when v_to = 'resolved_refunded' then pg_catalog.now() else resolved_at end,
         resolved_by = case when v_to = 'resolved_refunded' then v_actor else resolved_by end,
         updated_at = pg_catalog.now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'state', v_to, 'refund_status', r.status);
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.tg_movement_no_backdate()                                       from public, anon, authenticated;
revoke all on function public.attribute_receipt_restock(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,int) from public, anon, authenticated;
revoke all on function public.resolve_exception_by_refund(jsonb)                              from public, anon, authenticated;
grant  execute on function public.attribute_receipt_restock(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,int) to service_role;
grant  execute on function public.resolve_exception_by_refund(jsonb)                          to service_role;
