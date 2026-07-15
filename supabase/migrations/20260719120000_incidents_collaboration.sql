-- Incident Management Phase 2 — Operations Collaboration. Extends Phase 1 (does not redesign).
-- People (owner/assignee/watchers/followers), teams, notes, checklists, snooze. Everything
-- remains auditable via the append-only incident_history; nothing is destructively removed
-- without a history entry.

alter table public.incidents
  add column if not exists owner_id        uuid references public.users(id) on delete set null,
  add column if not exists owner_name      text,
  add column if not exists team            varchar(30),     -- finance|warehouse|support|marketing|admin
  add column if not exists snoozed_until   timestamptz,
  add column if not exists severity_locked boolean not null default false;  -- manual override wins over auto-inherit

-- Watchers / followers (owner + assignee live on the incident row; these are the many-to-many).
create table if not exists public.incident_participants (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  user_id      uuid references public.users(id) on delete set null,
  user_name    text not null,
  role         varchar(20) not null default 'watcher',  -- watcher|follower
  created_at   timestamptz not null default now(),
  unique (incident_id, user_id, role)
);
create index if not exists incident_participants_incident_idx on public.incident_participants (incident_id);

-- Timestamped operational notes ("Waiting for Razorpay", "Refund manually processed").
create table if not exists public.incident_notes (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  note         text not null,
  author_id    uuid references public.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists incident_notes_incident_idx on public.incident_notes (incident_id, created_at);

-- Checklist items (seeded from a configurable template per category on incident creation).
create table if not exists public.incident_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  label        text not null,
  done         boolean not null default false,
  done_by      text,
  done_at      timestamptz,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists incident_checklist_incident_idx on public.incident_checklist_items (incident_id, sort_order);

alter table public.incident_participants     enable row level security;
alter table public.incident_notes            enable row level security;
alter table public.incident_checklist_items  enable row level security;
grant all on public.incident_participants     to service_role;
grant all on public.incident_notes            to service_role;
grant all on public.incident_checklist_items  to service_role;
