-- Incident Management Phase 4 — Enterprise Readiness. Extends Phases 1–3 (does NOT redesign).
-- Adds: confidence scoring, priority (distinct from severity), SLA targets + breach tracking,
-- manual merge/split/dismiss/reclassify, recovery detection, postmortems, runbook progress,
-- suppression rules, maintenance windows, and simulation (fire-drill) flags. Everything stays
-- deterministic + explainable and fully auditable (all mutations already log to incident_history).

alter table public.incidents
  add column if not exists confidence          integer,        -- 0–100 (how sure the engine is)
  add column if not exists confidence_reasons  jsonb,          -- [{factor,detail,points}] — explainable
  add column if not exists priority             varchar(12),    -- p1|p2|p3|p4 (from severity × impact matrix)
  add column if not exists impact_level         varchar(12),    -- none|low|medium|high (business impact bucket)
  add column if not exists impact_cost          numeric(12,2),  -- estimated financial cost of the incident
  add column if not exists sla_target_min       integer,        -- resolution SLA target (minutes)
  add column if not exists sla_due_at           timestamptz,    -- started_at + target
  add column if not exists sla_breached         boolean not null default false,
  add column if not exists sla_breached_at      timestamptz,
  add column if not exists recovery_at          timestamptz,    -- when the upstream system recovered
  add column if not exists dismissed_at         timestamptz,    -- false-positive dismissal
  add column if not exists dismiss_reason       text,
  add column if not exists false_positive       boolean not null default false,
  add column if not exists reclassified_from     varchar(30),   -- previous category if reclassified
  add column if not exists merged_into_id        uuid references public.incidents(id) on delete set null, -- manual merge: this → target
  add column if not exists split_from_id         uuid references public.incidents(id) on delete set null, -- manual split: created from
  add column if not exists is_simulation         boolean not null default false, -- fire-drill; excluded from real metrics
  add column if not exists assignment_reason      text;         -- why auto-assignment routed it here (explainable)

-- Runbook progress — the guided operational workflow per incident (distinct from checklists:
-- ordered steps with instructions + an explicit action). Seeded from a configurable template.
create table if not exists public.incident_runbook_steps (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  step_no       integer not null,
  title         text not null,
  instruction   text,
  action        varchar(40),               -- retry|verify|check|contact|wait|escalate|custom
  done          boolean not null default false,
  done_by       text,
  done_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (incident_id, step_no)
);
create index if not exists incident_runbook_incident_idx on public.incident_runbook_steps (incident_id, step_no);

-- Postmortems — one per resolved incident, deterministically assembled + searchable.
create table if not exists public.incident_postmortems (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.incidents(id) on delete cascade unique,
  summary        text,
  root_cause     text,
  timeline       jsonb,          -- [{at,event,detail}]
  impact         text,
  resolution     text,
  lessons        text,
  generated_at   timestamptz not null default now(),
  generated_by   text
);
create index if not exists incident_postmortems_incident_idx on public.incident_postmortems (incident_id);

-- Suppression rules — operator-created; stop incident creation for a known-noisy signature within
-- an optional time range. Fully audited (created_by) and reversible (enabled flag).
create table if not exists public.incident_suppression_rules (
  id            uuid primary key default gen_random_uuid(),
  reason        text not null,
  category      varchar(30),               -- match this category (null = any)
  subsystem     varchar(20),               -- or this subsystem (null = any)
  root_cause_system varchar(20),           -- or this root-cause system (null = any)
  reason_pattern text,                     -- regex over failure reason (null = any)
  starts_at     timestamptz,               -- null = immediately
  ends_at       timestamptz,               -- null = until disabled
  enabled       boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists incident_suppression_enabled_idx on public.incident_suppression_rules (enabled);

-- Maintenance windows — a scoped, time-boxed suppression for a system under maintenance.
create table if not exists public.maintenance_windows (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  root_cause_system varchar(20),           -- razorpay|shiprocket|smtp|inventory|database|supabase (null = all)
  subsystem     varchar(20),               -- or a subsystem (null = all)
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  enabled       boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists maintenance_windows_active_idx on public.maintenance_windows (enabled, starts_at, ends_at);

-- ── Indexes for the new query paths ──────────────────────────────────────────────
create index if not exists incidents_priority_idx    on public.incidents (priority) where status in ('open','investigating','mitigated');
create index if not exists incidents_sla_idx          on public.incidents (sla_due_at) where status in ('open','investigating','mitigated') and sla_breached = false;
create index if not exists incidents_review_idx       on public.incidents (confidence) where status in ('open','investigating','mitigated');
create index if not exists incidents_merged_idx       on public.incidents (merged_into_id);
create index if not exists incidents_simulation_idx   on public.incidents (is_simulation);

alter table public.incident_runbook_steps       enable row level security;
alter table public.incident_postmortems         enable row level security;
alter table public.incident_suppression_rules   enable row level security;
alter table public.maintenance_windows          enable row level security;
grant all on public.incident_runbook_steps       to service_role;
grant all on public.incident_postmortems         to service_role;
grant all on public.incident_suppression_rules   to service_role;
grant all on public.maintenance_windows          to service_role;
