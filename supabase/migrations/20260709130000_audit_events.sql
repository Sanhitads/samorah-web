-- Audit-Event Log (Design Principles d · 18 · 22) — ONE immutable, append-only
-- stream every business action writes to. Powers the audit trail (who did what,
-- prev→new state) and future Analytics (delivery time, RTO, cost, etc.) with no
-- extra capture. Never updated/deleted in normal operation.
create table if not exists public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references public.orders(id) on delete set null,  -- nullable (non-order events)
  entity_type    varchar(30) not null,   -- order | shipment | fulfillment | return | exception | payment
  entity_id      uuid,
  event          varchar(50) not null,   -- fulfillment.picking | shipment.created | order.dispatched | refund.initiated | ...
  actor_type     varchar(20) not null default 'system', -- staff | customer | system | webhook
  actor_id       uuid,                   -- user id when staff/customer
  previous_state varchar(40),
  new_state      varchar(40),
  notes          text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists audit_events_order_idx  on public.audit_events (order_id, created_at);
create index if not exists audit_events_event_idx  on public.audit_events (event);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index if not exists audit_events_time_idx   on public.audit_events (created_at);
alter table public.audit_events enable row level security;
grant all on public.audit_events to service_role;

-- Append-only writer (never overwrites; the log is immutable).
create or replace function public.record_audit_event(p jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_events (
    order_id, entity_type, entity_id, event, actor_type, actor_id, previous_state, new_state, notes, metadata
  ) values (
    nullif(p->>'order_id','')::uuid, p->>'entity_type', nullif(p->>'entity_id','')::uuid, p->>'event',
    coalesce(nullif(p->>'actor_type',''), 'system'), nullif(p->>'actor_id','')::uuid,
    nullif(p->>'previous_state',''), nullif(p->>'new_state',''), nullif(p->>'notes',''),
    case when (p->'metadata') is null or jsonb_typeof(p->'metadata') = 'null' then null else p->'metadata' end
  );
$$;
revoke all on function public.record_audit_event(jsonb) from public, anon, authenticated;
grant  execute on function public.record_audit_event(jsonb) to service_role;
