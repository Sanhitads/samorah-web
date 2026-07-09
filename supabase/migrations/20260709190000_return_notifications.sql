-- Return notifications — extend the dispatch log's idempotency key with an
-- entity_ref so notifications for DIFFERENT returns on the SAME order (same event,
-- same recipient) don't collapse onto one row. Order events use entity_ref = ''
-- (order_id already disambiguates them); return events use the return id.

alter table public.notification_dispatches add column if not exists entity_ref varchar(80) not null default '';

-- Swap the 4-column unique for a 5-column one (include entity_ref).
alter table public.notification_dispatches
  drop constraint if exists notification_dispatches_order_id_event_channel_recipient_key;
alter table public.notification_dispatches
  add constraint notification_dispatches_dedup_key
  unique (order_id, event, channel, recipient, entity_ref);

create or replace function public.record_notification(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.notification_dispatches (order_id, event, channel, recipient, entity_ref, status, provider_message_id, error)
  values (nullif(p->>'order_id','')::uuid, p->>'event', p->>'channel', p->>'recipient',
          coalesce(p->>'entity_ref',''), coalesce(nullif(p->>'status',''),'sent'),
          nullif(p->>'provider_message_id',''), nullif(p->>'error',''))
  on conflict (order_id, event, channel, recipient, entity_ref) do update
    set status = excluded.status,
        provider_message_id = coalesce(excluded.provider_message_id, notification_dispatches.provider_message_id),
        error = excluded.error
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.record_notification(jsonb) from public, anon, authenticated;
grant execute on function public.record_notification(jsonb) to service_role;
