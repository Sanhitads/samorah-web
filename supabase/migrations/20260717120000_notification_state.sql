-- Notification workflow state (review points 5, 8) — a human-workflow layer ON TOP of the
-- derived operational alerts. The alerts themselves auto-resolve when the condition clears;
-- this table lets staff acknowledge / claim / annotate an alert item so others don't
-- duplicate the work ("Rahul is investigating"). Keyed by a stable per-item alert key
-- (e.g. "refund_failed:<refundId>"). Admin/service-role only.

create table if not exists public.notification_state (
  alert_key     text primary key,
  state         varchar(20) not null default 'open'
                  check (state in ('open', 'acknowledged', 'in_progress', 'resolved')),
  assignee_id   uuid references public.users(id) on delete set null,
  assignee_name text,
  note          text,
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index if not exists notification_state_updated_idx on public.notification_state (updated_at desc);

alter table public.notification_state enable row level security;
grant all on public.notification_state to service_role;
-- No public policy: the admin app reads/writes via the service role (staff-gated in code).
