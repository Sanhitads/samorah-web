-- Multi-channel notification engine (operational alerting). A single log of every operational
-- notification dispatch across all channels (in-app, email, Slack, SMS, WhatsApp, push). This is
-- ADDITIVE — it does NOT touch the existing customer-transactional `notification_dispatches` table
-- or the `notify()` engine; operational/staff alerts are a sibling fan-out sharing the channel layer.

create table if not exists public.notification_log (
  id                   uuid primary key default gen_random_uuid(),
  event                varchar(60) not null,       -- order.placed | payment.gateway_down | daily.sales_report | …
  channel              varchar(20) not null,       -- in_app | email | slack | sms | whatsapp | push
  severity             varchar(20) not null default 'info',  -- info | warning | critical
  target               text,                        -- slack channel key / phone / email / 'dashboard'
  title                text,
  status               varchar(20) not null,        -- sent | failed | skipped
  provider_message_id  text,
  error                text,
  payload              jsonb,                        -- the rendered OpsPayload (fields, url, message)
  entity_type          varchar(30),                 -- order | incident | inventory | shipment | …
  entity_ref           text,                        -- order number / incident number / sku …
  created_at           timestamptz not null default now()
);
create index if not exists notification_log_event_idx   on public.notification_log (event, created_at desc);
create index if not exists notification_log_channel_idx  on public.notification_log (channel, created_at desc);
create index if not exists notification_log_created_idx   on public.notification_log (created_at desc);
create index if not exists notification_log_entity_idx    on public.notification_log (entity_type, entity_ref);
create index if not exists notification_log_severity_idx   on public.notification_log (severity) where severity = 'critical';

alter table public.notification_log enable row level security;
grant all on public.notification_log to service_role;
