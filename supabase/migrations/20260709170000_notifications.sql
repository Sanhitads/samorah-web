-- Notification Engine (review point 8 / SLP principle e) — the single place every
-- business event fans out to the customer. One append-only DISPATCH log, idempotent
-- per (order, event, channel, recipient) so a re-emit or a job retry never
-- double-sends. (Named `notification_dispatches` to avoid the pre-existing
-- `notifications` user-inbox table, which is a different concept.) Channels
-- (email now; WhatsApp/SMS/push later) record their outcome here; business
-- services NEVER call an email builder directly.

create table if not exists public.notification_dispatches (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id) on delete set null,
  event               varchar(40) not null,   -- order.confirmed | order.dispatched | order.cancelled | ...
  channel             varchar(20) not null,   -- email | whatsapp | sms | push
  recipient           varchar(255) not null,
  status              varchar(20) not null default 'sent'
                        check (status in ('sent','failed','skipped')),
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now(),
  unique (order_id, event, channel, recipient)  -- idempotent fan-out
);

create index if not exists notif_dispatch_order_idx on public.notification_dispatches (order_id, created_at);
create index if not exists notif_dispatch_event_idx on public.notification_dispatches (event);

alter table public.notification_dispatches enable row level security;
grant all on public.notification_dispatches to service_role;
-- service-role only (no anon/authenticated policy).

-- Idempotent recorder: first write for a (order,event,channel,recipient) wins;
-- a retry updates the outcome in place rather than inserting a duplicate.
create or replace function public.record_notification(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.notification_dispatches (order_id, event, channel, recipient, status, provider_message_id, error)
  values (nullif(p->>'order_id','')::uuid, p->>'event', p->>'channel', p->>'recipient',
          coalesce(nullif(p->>'status',''),'sent'), nullif(p->>'provider_message_id',''), nullif(p->>'error',''))
  on conflict (order_id, event, channel, recipient) do update
    set status = excluded.status,
        provider_message_id = coalesce(excluded.provider_message_id, notification_dispatches.provider_message_id),
        error = excluded.error
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.record_notification(jsonb) from public, anon, authenticated;
grant execute on function public.record_notification(jsonb) to service_role;
