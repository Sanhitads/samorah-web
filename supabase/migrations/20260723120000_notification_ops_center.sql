-- Notification Operations Center. Extends the multi-channel notification_log (does NOT redesign):
-- groups a fan-out into one feed item, tracks the real delivery lifecycle (queued → sending →
-- delivered/failed → retrying) with attempts + retry history + measured latency, adds read/ack
-- state for the bell badge, categories for filtering, and a retention policy so the table cannot
-- grow forever. Plus per-user channel preferences (applied to per-user channels today).

alter table public.notification_log
  add column if not exists group_id        uuid,            -- one notifyOps() fan-out = one feed item
  add column if not exists category        varchar(20),     -- orders|payments|inventory|warehouse|marketing|customers|system
  add column if not exists attempts        integer not null default 1,
  add column if not exists delivery_ms     integer,         -- measured provider latency (delivery-rate stats)
  add column if not exists last_attempt_at timestamptz,
  add column if not exists retry_history   jsonb not null default '[]'::jsonb,  -- [{at,status,error,by}]
  add column if not exists read_at         timestamptz,     -- bell badge / unread filter
  add column if not exists acknowledged_at timestamptz,     -- critical alerts must be acknowledged
  add column if not exists acknowledged_by text,
  add column if not exists retention_class varchar(20) not null default 'operational', -- high|operational|debug
  add column if not exists expires_at      timestamptz;     -- purge date (retention policy)

-- Normalise the legacy success status to the lifecycle vocabulary.
update public.notification_log set status = 'delivered' where status = 'sent';

create index if not exists notification_log_group_idx    on public.notification_log (group_id);
create index if not exists notification_log_category_idx  on public.notification_log (category, created_at desc);
create index if not exists notification_log_unread_idx    on public.notification_log (created_at desc) where read_at is null;
create index if not exists notification_log_ack_idx       on public.notification_log (created_at desc) where severity = 'critical' and acknowledged_at is null;
create index if not exists notification_log_expires_idx   on public.notification_log (expires_at) where expires_at is not null;
create index if not exists notification_log_status_idx    on public.notification_log (status, created_at desc);
-- Trigram index so the feed's free-text search (ILIKE %q%) stays indexed at 50k+ rows.
create extension if not exists pg_trgm;
create index if not exists notification_log_search_idx on public.notification_log
  using gin ((coalesce(title,'') || ' ' || coalesce(entity_ref,'') || ' ' || event) gin_trgm_ops);

-- Per-user channel preferences. Broadcast channels (a Slack channel) stay channel-wide; per-user
-- channels (email, and later WhatsApp/push) honour these. `event` OR `category` scopes the rule.
create table if not exists public.notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  event       varchar(60),          -- specific event (null = category-wide rule)
  category    varchar(20),          -- category-wide (null = event-specific rule)
  channel     varchar(20) not null, -- in_app|email|slack|sms|whatsapp|push
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, event, category, channel)
);
create index if not exists notification_preferences_user_idx on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;
grant all on public.notification_preferences to service_role;
