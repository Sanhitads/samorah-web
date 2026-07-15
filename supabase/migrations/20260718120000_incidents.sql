-- Incident Management foundation (Phase 1). A correlation layer ABOVE notifications:
-- deterministic rules group related notifications caused by one operational problem into a
-- single incident, to cut noise for ops staff (Datadog/Stripe-style). Notifications are
-- untouched; notification_state stays. Incidents reference notifications by their stable key.

create sequence if not exists incident_number_seq;

create table if not exists public.incidents (
  id                      uuid primary key default gen_random_uuid(),
  number                  text unique not null default ('INC-' || lpad(nextval('incident_number_seq')::text, 5, '0')),
  title                   text not null,
  description             text,
  category                varchar(30) not null,   -- payment_gateway|refund|shipment|inventory|email|import_export|unknown
  severity                varchar(20) not null default 'medium',  -- critical|high|medium|low|info
  status                  varchar(20) not null default 'open',    -- open|investigating|mitigated|resolved|closed
  root_cause              text,
  source_system           varchar(40),
  rule_id                 varchar(60),            -- which rule opened it (for merge matching)
  assignee_id             uuid references public.users(id) on delete set null,
  assignee_name           text,
  affected_orders         integer not null default 0,
  affected_notifications  integer not null default 0,
  resolution_notes        text,
  started_at              timestamptz not null default now(),
  last_activity_at        timestamptz not null default now(),
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists incidents_status_idx   on public.incidents (status, last_activity_at desc);
create index if not exists incidents_open_rule_idx on public.incidents (category, rule_id) where status in ('open','investigating','mitigated');

-- The notifications attached to an incident (referenced by their stable alert key, so we
-- never duplicate the derived notification into a table).
create table if not exists public.incident_notifications (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  alert_key     text not null,
  order_number  text,
  severity      varchar(20),
  added_at      timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (incident_id, alert_key)
);
create index if not exists incident_notifications_incident_idx on public.incident_notifications (incident_id);
create index if not exists incident_notifications_key_idx      on public.incident_notifications (alert_key);
create index if not exists incident_notifications_order_idx    on public.incident_notifications (order_number);

-- The immutable incident timeline.
create table if not exists public.incident_history (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  event        varchar(40) not null,  -- created|assigned|status_changed|notification_added|notification_resolved|resolved|note_added
  detail       text,
  actor_id     uuid references public.users(id) on delete set null,
  actor_name   text,
  created_at   timestamptz not null default now()
);
create index if not exists incident_history_incident_idx on public.incident_history (incident_id, created_at);

alter table public.incidents             enable row level security;
alter table public.incident_notifications enable row level security;
alter table public.incident_history      enable row level security;
grant all on public.incidents             to service_role;
grant all on public.incident_notifications to service_role;
grant all on public.incident_history      to service_role;
grant usage, select on sequence incident_number_seq to service_role;
-- No public policies: the admin app reads/writes via the service role (staff-gated in code).
