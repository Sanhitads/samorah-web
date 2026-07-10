-- Notification Center — event notifications (the second class).
--
-- The center has TWO classes:
--   1. OPERATIONAL (derived) — "5 returns awaiting review". Computed live from the
--      source tables; no rows here. Already built (getAdminAlerts).
--   2. EVENT (this table) — "a customer replied", "new wholesale enquiry", "media
--      processing failed", "newsletter import finished". These are real, one-time
--      events that NO query can reconstruct — someone must record them when they
--      happen. Producers call emitNotification() as their feature ships.
--
-- Unlike audit_events (immutable history of everything), this is a small, mutable
-- inbox: each row is read/dismissed. Kept separate so the audit trail stays pure.

create table if not exists public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  kind         varchar(60)  not null,               -- customer.replied · wholesale.enquiry · media.failed · newsletter.import_done
  severity     varchar(10)  not null default 'info' check (severity in ('info','warn','critical')),
  title        text         not null,
  body         text,
  href         text,                                -- deep link to resolve/act on it
  entity_type  varchar(40),
  entity_id    uuid,
  read_at      timestamptz,                         -- null = unread
  created_at   timestamptz  not null default now()
);

create index if not exists admin_notifications_unread_idx on public.admin_notifications (read_at, created_at desc);

alter table public.admin_notifications enable row level security;
grant all on public.admin_notifications to service_role;
