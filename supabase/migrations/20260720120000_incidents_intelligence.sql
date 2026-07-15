-- Incident Management Phase 3 — Enterprise Operations Intelligence. Extends Phases 1 & 2
-- (does not redesign). Adds: deterministic root-cause classification, cross-system correlation
-- grouping (parent/child), subsystem tagging for the health dashboard, knowledge base
-- (prevention), a business-impact snapshot, MTTD support, and an append-only escalation ledger.
-- Everything remains explainable — no AI. Plus indexes sized for 100k+ notifications / 10k+
-- incidents. Nothing is destructively removed without a history entry.

alter table public.incidents
  add column if not exists root_cause_system       varchar(20),   -- razorpay|shiprocket|smtp|inventory|database|supabase|unknown
  add column if not exists parent_incident_id       uuid references public.incidents(id) on delete set null, -- child → primary in a cross-system group
  add column if not exists subsystem                varchar(20),   -- payments|inventory|shipping|email|checkout|customers
  add column if not exists prevention               text,          -- KB: how to prevent recurrence (required to resolve)
  add column if not exists kb_resolution            text,          -- KB: what fixed it (required to resolve)
  add column if not exists detected_at              timestamptz,   -- first underlying failure time — for Mean Time To Detect
  add column if not exists escalation_level         integer not null default 0, -- 0 none · 1 manager · 2 admin · 3 channels
  add column if not exists impact_orders            integer,       -- business-impact snapshot (null = not yet computed)
  add column if not exists impact_revenue           numeric(12,2),
  add column if not exists impact_customers         integer,
  add column if not exists impact_refund_value      numeric(12,2),
  add column if not exists impact_shipments_delayed integer,
  add column if not exists impact_computed_at       timestamptz;

-- Escalation ledger — one row per escalation step fired. Append-only, explainable, auditable.
create table if not exists public.incident_escalations (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  level        integer not null,             -- 1 manager · 2 admin · 3 channels
  target_role  varchar(20) not null,         -- manager|admin
  channels     text not null,                -- csv: in_app,email,slack,sms
  reason       text not null,                -- "Unresolved 32 min (threshold 30 min)"
  age_minutes  integer not null,
  created_at   timestamptz not null default now(),
  unique (incident_id, level)                -- each level fires at most once
);
create index if not exists incident_escalations_incident_idx on public.incident_escalations (incident_id);

-- ── Performance indexes for scale (100k+ notifications, 10k+ incidents) ──────────
create index if not exists incidents_category_idx    on public.incidents (category, started_at desc);
create index if not exists incidents_rootcause_idx    on public.incidents (root_cause_system);
create index if not exists incidents_subsystem_idx    on public.incidents (subsystem) where status in ('open','investigating','mitigated');
create index if not exists incidents_parent_idx       on public.incidents (parent_incident_id);
create index if not exists incidents_resolved_idx     on public.incidents (resolved_at desc) where resolved_at is not null;
create index if not exists incidents_started_idx      on public.incidents (started_at desc);
create index if not exists incidents_assignee_idx     on public.incidents (assignee_name);
create index if not exists incident_notifications_open_idx on public.incident_notifications (incident_id) where resolved_at is null;

alter table public.incident_escalations enable row level security;
grant all on public.incident_escalations to service_role;
