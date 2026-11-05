-- ============================================================================
-- MANUFACTURING — Phase 9: batch holds, recalls, quarantine & affected-customer traceability
-- ============================================================================
-- INERT for untracked commerce (recall containment acts on batches; no live tracked variant). ADDITIVE.
-- apply_stock_movement unchanged; variants.stock and batch_allocations are NEVER changed by a recall
-- (history preserved). Containment REUSES the existing manufacturing_batches.recall_state column, which
-- every gate already enforces (release_batch, allocate_order_batches, confirm_pick_batch,
-- attribute_receipt_restock, assert_tracked_shipment_ready, assert_shipment_dispatchable) — so applying a
-- recall automatically blocks release/allocation/picking/substitution/shipment/dispatch and routes
-- returned units of recalled batches to quarantine. Reuses batch_material_consumption + material_lots for
-- supplier-lot tracing, and shipment_batch_lines / batch_pick_confirmations / batch_allocations for
-- affected-order reverse traceability (actual shipped evidence distinguished from logical allocation).
-- DO NOT activate tracking, push or deploy.
-- ============================================================================

create sequence if not exists public.recall_case_seq;

-- ── B.1 formal recall / hold case (append-only audit via recall_case_events) ─
create table if not exists public.recall_cases (
  id                 uuid primary key default gen_random_uuid(),
  recall_number      text unique,
  kind               text not null check (kind in ('manufacturing_hold','recall')),  -- temporary hold vs formal recall
  severity           text not null default 'medium' check (severity in ('low','medium','high','critical')),
  reason             text not null,
  evidence           jsonb,
  investigation_notes text,
  required_actions   jsonb,
  status             text not null default 'draft'
                       check (status in ('draft','initiated','contained','investigating','action_required','closed','cancelled')),
  containment_status text not null default 'pending' check (containment_status in ('pending','contained','released')),
  closure_decision   text,
  initiated_by       uuid references public.users(id) on delete set null,
  approved_by        uuid references public.users(id) on delete set null,
  initiated_at       timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create table if not exists public.recall_case_batches (
  recall_id uuid not null references public.recall_cases(id) on delete restrict,
  batch_id  uuid not null references public.manufacturing_batches(id) on delete restrict,
  variant_id uuid references public.variants(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (recall_id, batch_id)
);
create table if not exists public.recall_case_lots (
  recall_id uuid not null references public.recall_cases(id) on delete restrict,
  material_lot_id uuid not null references public.material_lots(id) on delete restrict,
  added_at  timestamptz not null default now(),
  primary key (recall_id, material_lot_id)
);
create table if not exists public.recall_case_events (
  id uuid primary key default gen_random_uuid(),
  recall_id uuid not null references public.recall_cases(id) on delete restrict,
  event text not null, from_state text, to_state text,
  actor_id uuid references public.users(id) on delete set null,
  notes text, created_at timestamptz not null default now()
);
create index if not exists rcb_batch_idx on public.recall_case_batches(batch_id);
create index if not exists rcl_lot_idx on public.recall_case_lots(material_lot_id);
create index if not exists rce_recall_idx on public.recall_case_events(recall_id, created_at);
alter table public.recall_cases        enable row level security;
alter table public.recall_case_batches enable row level security;
alter table public.recall_case_lots    enable row level security;
alter table public.recall_case_events  enable row level security;
grant select, insert, update on public.recall_cases        to service_role;
grant select, insert, delete on public.recall_case_batches to service_role;  -- membership editable pre-containment
grant select, insert, delete on public.recall_case_lots    to service_role;
grant select, insert on public.recall_case_events          to service_role;  -- append-only audit

-- ── B.1 create a recall case ─────────────────────────────────────────────────
create or replace function public.create_recall_case(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_kind text := p->>'kind'; v_num text; v_actor uuid := nullif(p->>'actor_id','')::uuid;
begin
  if v_kind not in ('manufacturing_hold','recall') or nullif(p->>'reason','') is null then
    raise exception 'create_recall_case: kind(manufacturing_hold|recall) and reason required' using errcode = 'invalid_parameter_value';
  end if;
  v_num := 'RC-' || to_char(pg_catalog.now(),'YYMMDD') || '-' || lpad(nextval('public.recall_case_seq')::text, 4, '0');
  insert into public.recall_cases(recall_number, kind, severity, reason, evidence, required_actions, initiated_by, status)
  values (v_num, v_kind, coalesce(nullif(p->>'severity',''),'medium'), p->>'reason', p->'evidence', p->'required_actions', v_actor, 'draft')
  returning id into v_id;
  insert into public.recall_case_events(recall_id, event, to_state, actor_id, notes) values (v_id, 'created', 'draft', v_actor, p->>'reason');
  return jsonb_build_object('ok', true, 'recall_id', v_id, 'recall_number', v_num);
end $$;

-- ── B.1 lifecycle transition (documented rules; NEVER auto-closes on zero stock) ──
create or replace function public.recall_case_transition(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_to text := p->>'to_state'; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        c public.recall_cases%rowtype; v_allowed boolean;
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
    else false end;  -- closed / cancelled are terminal
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
  insert into public.recall_case_events(recall_id, event, from_state, to_state, actor_id, notes)
  values (v_id, 'transition', c.status, v_to, v_actor, nullif(p->>'notes',''));
  return jsonb_build_object('ok', true, 'status', v_to);
end $$;

-- ── B.3 immediate containment: set recall_state on every case batch (reuses all gates) ──
-- Transactional, idempotent, locks batches in id order (no cross with order→variant→batch picking lock,
-- which never locks recall_cases). Sets recall_state='recalled' — history (allocations/picks/shipments)
-- is untouched. Returning affected units to sellable stock is already blocked by attribute_receipt_restock.
create or replace function public.apply_recall_containment(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'recall_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid;
        r record; v_n int := 0; v_state text;
begin
  if v_id is null then raise exception 'containment: recall_id required' using errcode='invalid_parameter_value'; end if;
  if not exists (select 1 from public.recall_cases where id = v_id and status in ('initiated','contained','investigating','action_required')) then
    raise exception 'containment: recall must be initiated (not draft/closed/cancelled)' using errcode='check_violation';
  end if;
  v_state := case (select kind from public.recall_cases where id = v_id) when 'recall' then 'recalled' else 'on_hold' end;
  for r in select batch_id from public.recall_case_batches where recall_id = v_id order by batch_id for update loop
    update public.manufacturing_batches set recall_state = v_state where id = r.batch_id and recall_state <> v_state;
    v_n := v_n + 1;
  end loop;
  update public.recall_cases set containment_status = 'contained', status = case when status='initiated' then 'contained' else status end, updated_at = pg_catalog.now() where id = v_id;
  insert into public.recall_case_events(recall_id, event, to_state, actor_id, notes) values (v_id, 'containment_applied', v_state, v_actor, 'batches='||v_n);
  return jsonb_build_object('ok', true, 'batches', v_n, 'recall_state', v_state);
end $$;

-- ── B.2 supplier-lot ⇄ batch tracing (physical consumption, not shared formula) ──
create or replace function public.batch_material_lots(p_batch_id uuid)
returns table(material_lot_id uuid, material_id uuid, supplier_name text, supplier_lot_code text, qty_consumed numeric, uom text, received_on date)
language sql stable set search_path = '' as $$
  select ml.id, ml.material_id, ml.supplier_name, ml.supplier_lot_code, c.qty_consumed, c.uom, ml.received_on
  from public.batch_material_consumption c join public.material_lots ml on ml.id = c.material_lot_id
  where c.batch_id = p_batch_id;
$$;
create or replace function public.material_lot_batches(p_lot_id uuid)
returns table(batch_id uuid, batch_code text, variant_id uuid, qty_consumed numeric, recall_state text, lifecycle_status text)
language sql stable set search_path = '' as $$
  select b.id, b.batch_code, b.variant_id, c.qty_consumed, b.recall_state, b.lifecycle_status
  from public.batch_material_consumption c join public.manufacturing_batches b on b.id = c.batch_id
  where c.material_lot_id = p_lot_id;
$$;

-- ── B.4 reverse traceability: batch → orders/customers, classified by ACTUAL vs logical evidence ──
create or replace function public.batch_affected_orders(p_batch_id uuid)
returns table(order_id uuid, order_item_id uuid, qty int, provenance text, order_status text, fulfillment_status text)
language sql stable set search_path = '' as $$
  -- ACTUAL shipped evidence (strongest)
  select sl.order_id, sl.order_item_id, sl.qty::int, 'shipped'::text, o.status::text, o.fulfillment_status::text
    from public.shipment_batch_lines sl join public.orders o on o.id = sl.order_id where sl.batch_id = p_batch_id
  union all
  -- confirmed picks not yet frozen into a shipment (actual, pre-dispatch)
  select pc.order_id, pc.order_item_id, pc.qty::int, 'picked'::text, o.status::text, o.fulfillment_status::text
    from public.batch_pick_confirmations pc join public.orders o on o.id = pc.order_id
    where pc.batch_id = p_batch_id
      and not exists (select 1 from public.shipment_batch_lines sl where sl.order_item_id = pc.order_item_id and sl.batch_id = pc.batch_id)
  union all
  -- LOGICAL allocation only (no actual pick/ship evidence — clearly distinguished, never fabricated)
  select ba.order_id, ba.order_item_id, ba.qty::int, 'allocated_logical'::text, o.status::text, o.fulfillment_status::text
    from public.batch_allocations ba join public.orders o on o.id = ba.order_id
    where ba.batch_id = p_batch_id and ba.state in ('allocated','picked','shipped')
      and not exists (select 1 from public.batch_pick_confirmations pc where pc.order_item_id = ba.order_item_id and pc.batch_id = ba.batch_id)
      and not exists (select 1 from public.shipment_batch_lines sl where sl.order_item_id = ba.order_item_id and sl.batch_id = ba.batch_id);
$$;
create or replace function public.lot_affected_orders(p_lot_id uuid)
returns table(batch_id uuid, order_id uuid, order_item_id uuid, qty int, provenance text)
language sql stable set search_path = '' as $$
  select b.batch_id, a.order_id, a.order_item_id, a.qty, a.provenance
  from public.material_lot_batches(p_lot_id) b
  cross join lateral public.batch_affected_orders(b.batch_id) a;
$$;

-- ── B.5 recall quantity accounting (per batch, by supported state) ───────────
create or replace function public.batch_recall_accounting(p_batch_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'batch_id', b.id, 'batch_code', b.batch_code, 'recall_state', b.recall_state,
    'produced', b.produced_qty, 'qc_rejected', b.rejected_qty, 'qc_sampled_destroyed', b.qc_sampled_destroyed_qty,
    'approved', b.approved_qty,
    'released', coalesce((select sum(qty) from public.batch_release_events where batch_id = b.id), 0),
    'on_hand', public.batch_onhand(b.id),
    'allocated_unpicked', coalesce((select sum(ba.qty) from public.batch_allocations ba where ba.batch_id = b.id and ba.state = 'allocated'),0),
    'picked', coalesce((select sum(qty) from public.batch_pick_confirmations where batch_id = b.id),0),
    'shipped', coalesce((select sum(qty) from public.shipment_batch_lines where batch_id = b.id),0),
    'quarantined', coalesce((select sum(qty) from public.batch_quarantine where batch_id = b.id and disposition = 'held'),0),
    'returned_restocked', coalesce((select sum(qty) from public.batch_stock_entries where batch_id = b.id and entry_type in ('return_restock','rto_restock')),0),
    'written_off', coalesce((select -sum(qty) from public.batch_stock_entries where batch_id = b.id and entry_type = 'writeoff'),0)
  ) from public.manufacturing_batches b where b.id = p_batch_id;
$$;

revoke all on function public.create_recall_case(jsonb)              from public, anon, authenticated;
revoke all on function public.recall_case_transition(jsonb)          from public, anon, authenticated;
revoke all on function public.apply_recall_containment(jsonb)        from public, anon, authenticated;
revoke all on function public.batch_material_lots(uuid)              from public, anon, authenticated;
revoke all on function public.material_lot_batches(uuid)             from public, anon, authenticated;
revoke all on function public.batch_affected_orders(uuid)            from public, anon, authenticated;
revoke all on function public.lot_affected_orders(uuid)              from public, anon, authenticated;
revoke all on function public.batch_recall_accounting(uuid)          from public, anon, authenticated;
grant  execute on function public.create_recall_case(jsonb)          to service_role;
grant  execute on function public.recall_case_transition(jsonb)      to service_role;
grant  execute on function public.apply_recall_containment(jsonb)    to service_role;
grant  execute on function public.batch_material_lots(uuid)          to service_role;
grant  execute on function public.material_lot_batches(uuid)         to service_role;
grant  execute on function public.batch_affected_orders(uuid)        to service_role;
grant  execute on function public.lot_affected_orders(uuid)          to service_role;
grant  execute on function public.batch_recall_accounting(uuid)      to service_role;
