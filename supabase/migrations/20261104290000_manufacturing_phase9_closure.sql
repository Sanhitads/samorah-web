-- ============================================================================
-- MANUFACTURING — Phase 9 closure: recall safety hardening, accounting, classification, notification prep
-- ============================================================================
-- INERT; apply_stock_movement unchanged; variants.stock & batch_allocations NEVER changed by a recall.
-- ADDITIVE. DO NOT activate tracking, push, deploy, or contact real customers.
--
-- A.1 INTERIM FAIL-CLOSED: a recall now sets manufacturing_batches.recall_state at INITIATION (and when a
--     batch is added to / expanded into an already-active case) — not at a deferred step — so there is NO
--     window where an initiated recall leaves a batch eligible. Every stock gate already re-checks
--     recall_state under a FOR UPDATE batch lock (confirm_pick_batch / allocate_order_batches / release_batch
--     / assert_tracked_shipment_ready / assert_shipment_dispatchable), so release/pick/substitute/dispatch
--     either serialise BEFORE the stamp (legitimately pre-recall) or see the stamp. Lock order is unchanged:
--     stock ops lock orders→variants→batches and NEVER lock recall_cases; recall ops lock recall_cases→
--     batches and NEVER lock orders/variants — batches are the only shared leaf, so no cycle.
-- A.2 OVERLAPPING CASES: recall_state reflects "covered by ≥1 OPEN case". Closing/cancelling a case does
--     NOT clear recall_state or release quarantine. Returning a batch to eligibility is a SEPARATE,
--     authorised op (release_batch_containment) that refuses while ANY open case still covers the batch.
-- A.3 LOT EXPANSION: expand_recall_batches adds newly-discovered lot-consuming batches to the case
--     (original set preserved via added_at), stamps them fail-closed, and audits — physical consumption
--     only, never shared formula.
-- B   Enhanced recall quantity accounting with current-vs-cumulative buckets + unknown + reconciliation.
-- E   batch_recall_impact: per-order shipment-state classification from real shipment/order records.
-- F   order_pick_fingerprint → SHA-256 over a canonical, stable-sorted active pick serialization.
-- D   recall_notifications table (contact-list prep; NO external sends).
-- ============================================================================

-- ── F. SHA-256 canonical pick fingerprint ────────────────────────────────────
create or replace function public.order_pick_fingerprint(p_order_id uuid)
returns text language sql stable set search_path = '' as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(string_agg(
      pc.order_item_id::text || '|' || pc.batch_id::text || '|' || pc.component_key || '|' ||
      pc.qty::text || '|' || pc.is_substitution::text || '|' || pc.id::text,
      ';' order by pc.order_item_id, pc.component_key, pc.id), 'empty'),
    'UTF8')), 'hex')
  from public.batch_pick_confirmations pc where pc.order_id = p_order_id;
$$;

-- ── A.2 effective coverage: is a batch covered by any OPEN recall/hold case? ──
create or replace function public.batch_open_recall_kind(p_batch_id uuid)
returns text language sql stable set search_path = '' as $$
  -- strictest open coverage wins (recall > hold); null when no open case covers the batch
  select case when exists (select 1 from public.recall_case_batches rb join public.recall_cases rc on rc.id = rb.recall_id
                            where rb.batch_id = p_batch_id and rc.kind = 'recall'
                              and rc.status in ('initiated','contained','investigating','action_required')) then 'recalled'
              when exists (select 1 from public.recall_case_batches rb join public.recall_cases rc on rc.id = rb.recall_id
                            where rb.batch_id = p_batch_id
                              and rc.status in ('initiated','contained','investigating','action_required')) then 'on_hold'
              else null end;
$$;

-- internal: stamp a single batch's recall_state to the strictest open coverage (fail-closed).
create or replace function public.recall_stamp_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  perform 1 from public.manufacturing_batches where id = p_batch_id for update;
  v_kind := public.batch_open_recall_kind(p_batch_id);
  if v_kind is not null then
    update public.manufacturing_batches set recall_state = v_kind, updated_at = pg_catalog.now()
     where id = p_batch_id and recall_state is distinct from v_kind;
  end if;
end $$;

-- ── A.1 add batches to a case; stamp immediately if the case is already active ──
create or replace function public.add_recall_batches(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_ids uuid[]; b uuid; v_active boolean; v_n int := 0;
begin
  if v_id is null then raise exception 'add_recall_batches: recall_id required' using errcode='invalid_parameter_value'; end if;
  select array(select jsonb_array_elements_text(p->'batch_ids'))::uuid[] into v_ids;
  v_active := (select status in ('initiated','contained','investigating','action_required') from public.recall_cases where id = v_id);
  foreach b in array coalesce(v_ids, '{}') loop
    insert into public.recall_case_batches(recall_id, batch_id, variant_id)
    values (v_id, b, (select variant_id from public.manufacturing_batches where id = b))
    on conflict (recall_id, batch_id) do nothing;
    if v_active then perform public.recall_stamp_batch(b); end if;  -- fail-closed on add to an active case
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'added', v_n, 'stamped', v_active);
end $$;

-- ── A.3 controlled expansion from the case's supplier lots (physical consumption only) ──
create or replace function public.expand_recall_batches(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        v_active boolean; r record; v_added int := 0;
begin
  if v_id is null then raise exception 'expand_recall: recall_id required' using errcode='invalid_parameter_value'; end if;
  v_active := (select status in ('initiated','contained','investigating','action_required') from public.recall_cases where id = v_id);
  for r in
    select distinct c.batch_id from public.recall_case_lots rl
      join public.batch_material_consumption c on c.material_lot_id = rl.material_lot_id
     where rl.recall_id = v_id
       and c.batch_id not in (select batch_id from public.recall_case_batches where recall_id = v_id)
  loop
    insert into public.recall_case_batches(recall_id, batch_id, variant_id)
    values (v_id, r.batch_id, (select variant_id from public.manufacturing_batches where id = r.batch_id))
    on conflict do nothing;
    if v_active then perform public.recall_stamp_batch(r.batch_id); end if;
    v_added := v_added + 1;
  end loop;
  insert into public.recall_case_events(recall_id, event, actor_id, notes) values (v_id, 'expanded_from_lots', v_actor, 'newly identified batches='||v_added);
  return jsonb_build_object('ok', true, 'added', v_added);
end $$;

-- ── A.1 transition: INITIATED stamps all case batches; CLOSE/CANCEL never releases containment ──
create or replace function public.recall_case_transition(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_to text := p->>'to_state'; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        c public.recall_cases%rowtype; v_allowed boolean; r record;
begin
  if v_id is null or v_to is null then raise exception 'transition: recall_id and to_state required' using errcode='invalid_parameter_value'; end if;
  select * into c from public.recall_cases where id = v_id for update;
  if not found then raise exception 'transition: recall % not found', v_id using errcode='foreign_key_violation'; end if;
  v_allowed := case c.status
    when 'draft'           then v_to in ('initiated','cancelled')
    when 'initiated'       then v_to in ('contained','investigating','cancelled')
    when 'contained'       then v_to in ('investigating','action_required','closed','cancelled')
    when 'investigating'   then v_to in ('action_required','contained','closed','cancelled')
    when 'action_required' then v_to in ('contained','investigating','closed','cancelled')
    else false end;
  if not v_allowed then raise exception 'transition: % → % not allowed', c.status, v_to using errcode='check_violation'; end if;
  if v_to = 'closed' and nullif(p->>'closure_decision','') is null then
    raise exception 'transition: closing a recall requires a closure_decision + authorised approver' using errcode='check_violation';
  end if;
  update public.recall_cases set status = v_to,
     initiated_at = case when v_to='initiated' then coalesce(initiated_at, pg_catalog.now()) else initiated_at end,
     investigation_notes = coalesce(nullif(p->>'investigation_notes',''), investigation_notes),
     closure_decision = case when v_to='closed' then p->>'closure_decision' else closure_decision end,
     approved_by = case when v_to='closed' then v_actor else approved_by end,
     closed_at = case when v_to='closed' then pg_catalog.now() else closed_at end,
     updated_at = pg_catalog.now()
   where id = v_id;
  -- A.1 fail-closed at initiation: stamp every current case batch NOW.
  if v_to = 'initiated' then
    for r in select batch_id from public.recall_case_batches where recall_id = v_id order by batch_id loop
      perform public.recall_stamp_batch(r.batch_id);
    end loop;
    update public.recall_cases set containment_status = 'contained' where id = v_id;
  end if;
  -- A.2 close/cancel NEVER clears recall_state or releases quarantine (explicit release is separate).
  insert into public.recall_case_events(recall_id, event, from_state, to_state, actor_id, notes)
  values (v_id, 'transition', c.status, v_to, v_actor, nullif(p->>'notes',''));
  return jsonb_build_object('ok', true, 'status', v_to);
end $$;

-- ── A.1 apply_recall_containment — idempotent re-stamp (console "apply" button) ──
create or replace function public.apply_recall_containment(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; r record; v_n int := 0; v_kind text;
begin
  if v_id is null then raise exception 'containment: recall_id required' using errcode='invalid_parameter_value'; end if;
  if not exists (select 1 from public.recall_cases where id = v_id and status in ('initiated','contained','investigating','action_required')) then
    raise exception 'containment: recall must be initiated (not draft/closed/cancelled)' using errcode='check_violation';
  end if;
  v_kind := case (select kind from public.recall_cases where id = v_id) when 'recall' then 'recalled' else 'on_hold' end;
  for r in select batch_id from public.recall_case_batches where recall_id = v_id order by batch_id loop
    perform public.recall_stamp_batch(r.batch_id); v_n := v_n + 1;
  end loop;
  update public.recall_cases set containment_status = 'contained', status = case when status='initiated' then 'contained' else status end, updated_at = pg_catalog.now() where id = v_id;
  insert into public.recall_case_events(recall_id, event, to_state, actor_id, notes) values (v_id, 'containment_applied', v_kind, v_actor, 'batches='||v_n);
  return jsonb_build_object('ok', true, 'batches', v_n, 'recall_state', v_kind);
end $$;

-- ── A.2 explicit, authorised return-to-eligibility (refused while any OPEN case still covers the batch) ──
create or replace function public.release_batch_containment(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_batch uuid := nullif(p->>'batch_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; v_reason text := nullif(p->>'reason','');
begin
  if v_batch is null or v_reason is null then raise exception 'release_containment: batch_id and reason required' using errcode='invalid_parameter_value'; end if;
  perform 1 from public.manufacturing_batches where id = v_batch for update;
  if public.batch_open_recall_kind(v_batch) is not null then
    raise exception 'release_containment: batch is still covered by an OPEN recall/hold case' using errcode='check_violation';
  end if;
  update public.manufacturing_batches set recall_state = 'none', updated_at = pg_catalog.now() where id = v_batch and recall_state <> 'none';
  insert into public.recall_case_events(recall_id, event, to_state, actor_id, notes)
  select rb.recall_id, 'batch_released', 'none', v_actor, coalesce(v_reason,'') from public.recall_case_batches rb where rb.batch_id = v_batch limit 1;
  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'recall_state', 'none');
end $$;

-- ── B. enhanced recall quantity accounting (current vs cumulative, unknown, reconciliation) ──
create or replace function public.batch_recall_accounting(p_batch_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  with b as (select * from public.manufacturing_batches where id = p_batch_id),
  rel as (select coalesce(sum(qty),0)::int q from public.batch_release_events where batch_id = p_batch_id),
  onh as (select public.batch_onhand(p_batch_id) q),
  alloc as (select coalesce(sum(qty),0)::int q from public.batch_allocations where batch_id = p_batch_id and state = 'allocated'),
  pick as (select coalesce(sum(qty),0)::int q from public.batch_pick_confirmations where batch_id = p_batch_id),
  ship as (select coalesce(sum(qty),0)::int q from public.shipment_batch_lines where batch_id = p_batch_id),
  quar as (select coalesce(sum(qty),0)::int q from public.batch_quarantine where batch_id = p_batch_id and disposition = 'held'),
  ret as (select coalesce(sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type in ('return_restock','rto_restock')),
  woff as (select coalesce(-sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type = 'writeoff'),
  sold as (select coalesce(-sum(qty),0)::int q from public.batch_stock_entries where batch_id = p_batch_id and entry_type = 'sale')  -- units committed out via sale overlay
  select jsonb_build_object(
    'batch_id', (select id from b), 'batch_code', (select batch_code from b), 'recall_state', (select recall_state from b),
    'cumulative', jsonb_build_object(  -- production/transaction measures (NOT additive physical units)
      'produced', (select produced_qty from b), 'qc_rejected', (select rejected_qty from b),
      'qc_sampled_destroyed', (select qc_sampled_destroyed_qty from b), 'approved', (select approved_qty from b),
      'released', (select q from rel), 'sold_from_batch', (select q from sold)),
    'current', jsonb_build_object(      -- current distinct physical / commitment buckets (no overlap)
      'sellable_on_hand', (select q from onh),                         -- remaining in an eligible batch overlay
      'allocated_unpicked', (select q from alloc),
      'in_fulfillment', greatest(0, (select q from sold) - (select q from ship)),  -- committed, not yet shipped
      'shipped', (select q from ship),
      'quarantined', (select q from quar)),
    'lifetime_returns_restocked', (select q from ret),
    'written_off', (select q from woff),
    -- Conservation: released == on_hand + sold_from_batch (= in_fulfillment + shipped) + written_off − returns.
    -- A non-zero unknown flags physical units the system cannot place → investigate.
    'unknown_qty', (select q from rel) - ((select q from onh) + (select q from sold) + (select q from woff) - (select q from ret)),
    'reconciled', ((select q from rel) - ((select q from onh) + (select q from sold) + (select q from woff) - (select q from ret))) = 0
  );
$$;

-- ── E. per-order shipment-state classification (from real shipment/order records, not inferred) ──
create or replace function public.batch_recall_impact(p_batch_id uuid)
returns table(order_id uuid, order_item_id uuid, qty int, provenance text, shipment_state text, order_status text)
language sql stable set search_path = '' as $$
  select a.order_id, a.order_item_id, a.qty, a.provenance,
    case
      when o.status = 'returned' then 'returned'
      when o.status = 'rto' or s.status = 'rto' then 'rto'
      when o.status = 'delivered' or s.status = 'delivered' then 'delivered'
      when s.status in ('in_transit','out_for_delivery') then 'in_transit'
      when s.status in ('picked_up') or o.status = 'shipped' then 'dispatched'
      when s.id is not null then 'shipment_created'
      when o.fulfillment_status in ('packed','qc_passed','ready_for_dispatch') then 'packed'
      when a.provenance in ('shipped','picked') or o.fulfillment_status in ('picking','picked','packing') then 'picked'
      when a.provenance = 'allocated_logical' then 'logical'
      else 'unknown' end as shipment_state,
    o.status::text
  from public.batch_affected_orders(p_batch_id) a
  join public.orders o on o.id = a.order_id
  left join public.shipments s on s.order_id = a.order_id;
$$;

-- ── D. customer-notification PREPARATION (contact list; NO external send) ────
create table if not exists public.recall_notifications (
  id            uuid primary key default gen_random_uuid(),
  recall_id     uuid not null references public.recall_cases(id) on delete restrict,
  order_id      uuid not null references public.orders(id) on delete restrict,
  provenance    text not null,                 -- shipped (actual) vs allocated_logical etc.
  necessity     text not null default 'review' check (necessity in ('review','required','not_required')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  attempts      int not null default 0,
  outcome       text,                          -- recorded result of a (future, external) attempt
  needs_followup boolean not null default false,
  email_snapshot text,                         -- captured at prep time (internal audit)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (recall_id, order_id)
);
create index if not exists rn_recall_idx on public.recall_notifications(recall_id);
alter table public.recall_notifications enable row level security;
grant select, insert, update on public.recall_notifications to service_role;

-- Build/refresh the reviewable contact list from ACTUAL provenance; NEVER sends. Idempotent per (recall,order).
create or replace function public.prepare_recall_notifications(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; r record; v_n int := 0;
begin
  if v_id is null then raise exception 'prepare_notifications: recall_id required' using errcode='invalid_parameter_value'; end if;
  for r in
    select distinct i.order_id, i.provenance, o.email
      from public.recall_case_batches rb
      cross join lateral public.batch_recall_impact(rb.batch_id) i
      join public.orders o on o.id = i.order_id
     where rb.recall_id = v_id and i.provenance = 'shipped'  -- confirmed shipped only are auto-'required'
  loop
    insert into public.recall_notifications(recall_id, order_id, provenance, necessity, email_snapshot)
    values (v_id, r.order_id, r.provenance, 'required', r.email)
    on conflict (recall_id, order_id) do update set provenance = excluded.provenance, updated_at = pg_catalog.now();
    v_n := v_n + 1;
  end loop;
  -- logical-allocation-only orders are listed for REVIEW (not auto-required; never fabricate shipment)
  for r in
    select distinct i.order_id, i.provenance, o.email
      from public.recall_case_batches rb
      cross join lateral public.batch_recall_impact(rb.batch_id) i
      join public.orders o on o.id = i.order_id
     where rb.recall_id = v_id and i.provenance <> 'shipped'
       and i.order_id not in (select order_id from public.recall_notifications where recall_id = v_id)
  loop
    insert into public.recall_notifications(recall_id, order_id, provenance, necessity, email_snapshot)
    values (v_id, r.order_id, r.provenance, 'review', r.email) on conflict (recall_id, order_id) do nothing;
    v_n := v_n + 1;
  end loop;
  insert into public.recall_case_events(recall_id, event, notes) values (v_id, 'notifications_prepared', 'contacts='||v_n||' (NO sends)');
  return jsonb_build_object('ok', true, 'prepared', v_n, 'dispatch_enabled', false);
end $$;

revoke all on function public.order_pick_fingerprint(uuid)          from public, anon, authenticated;
revoke all on function public.batch_open_recall_kind(uuid)          from public, anon, authenticated;
revoke all on function public.recall_stamp_batch(uuid)              from public, anon, authenticated;
revoke all on function public.add_recall_batches(jsonb)             from public, anon, authenticated;
revoke all on function public.expand_recall_batches(jsonb)          from public, anon, authenticated;
revoke all on function public.recall_case_transition(jsonb)         from public, anon, authenticated;
revoke all on function public.apply_recall_containment(jsonb)       from public, anon, authenticated;
revoke all on function public.release_batch_containment(jsonb)      from public, anon, authenticated;
revoke all on function public.batch_recall_accounting(uuid)         from public, anon, authenticated;
revoke all on function public.batch_recall_impact(uuid)             from public, anon, authenticated;
revoke all on function public.prepare_recall_notifications(jsonb)   from public, anon, authenticated;
grant  execute on function public.order_pick_fingerprint(uuid)      to service_role;
grant  execute on function public.batch_open_recall_kind(uuid)      to service_role;
grant  execute on function public.recall_stamp_batch(uuid)          to service_role;
grant  execute on function public.add_recall_batches(jsonb)         to service_role;
grant  execute on function public.expand_recall_batches(jsonb)      to service_role;
grant  execute on function public.recall_case_transition(jsonb)     to service_role;
grant  execute on function public.apply_recall_containment(jsonb)   to service_role;
grant  execute on function public.release_batch_containment(jsonb)  to service_role;
grant  execute on function public.batch_recall_accounting(uuid)     to service_role;
grant  execute on function public.batch_recall_impact(uuid)         to service_role;
grant  execute on function public.prepare_recall_notifications(jsonb) to service_role;
