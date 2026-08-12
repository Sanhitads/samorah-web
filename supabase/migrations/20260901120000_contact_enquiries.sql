-- Contact enquiries — customer messages from the /contact form, plus a lightweight timeline.
-- The public /api/contact route inserts via the service-role client (like newsletter); the admin
-- app reads/writes via service role, staff-gated in code. RLS enabled with NO public policies.
-- This stores enquiries ONLY — outbound email replies are a future phase.
-- Also extends the EXISTING cms_pages with a form_config JSONB for the Contact page (no new CMS).

create sequence if not exists enquiry_number_seq;

create table if not exists public.contact_enquiries (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null default ('ENQ-' || lpad(nextval('enquiry_number_seq')::text, 5, '0')),
  status        varchar(20) not null default 'new' check (status in ('new','open','replied','resolved','spam','archived')),
  first_name    text not null,
  last_name     text,
  email         text not null,
  phone         text,
  subject       text not null,
  order_number  text,
  message       text not null,
  consent       boolean not null default false,
  assignee_id   uuid references public.users(id) on delete set null,
  assignee_name text,
  admin_notes   text,
  source        varchar(30) not null default 'contact_form',
  meta          jsonb not null default '{}'::jsonb,   -- ip hash, user agent (spam / audit)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists contact_enquiries_status_idx on public.contact_enquiries (status, created_at desc);
create index if not exists contact_enquiries_email_idx  on public.contact_enquiries (email);

create table if not exists public.contact_enquiry_events (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.contact_enquiries(id) on delete cascade,
  kind        varchar(40) not null,   -- created | status | assigned | note
  detail      text,
  actor_id    uuid,
  actor_name  text,
  created_at  timestamptz not null default now()
);
create index if not exists contact_enquiry_events_idx on public.contact_enquiry_events (enquiry_id, created_at);

alter table public.contact_enquiries       enable row level security;
alter table public.contact_enquiry_events  enable row level security;
grant all on public.contact_enquiries       to service_role;
grant all on public.contact_enquiry_events  to service_role;
grant usage, select on sequence enquiry_number_seq to service_role;

-- Contact-page form configuration (enable order-number/phone, success/error/consent copy) lives on the
-- existing cms_pages row — extends the CMS, no new storage system. Nullable/defaulted → other pages ignore it.
alter table public.cms_pages add column if not exists form_config jsonb not null default '{}'::jsonb;
