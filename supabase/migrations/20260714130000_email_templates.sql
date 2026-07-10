-- CMS Slice 5 — Email Template Manager. Edit transactional email copy as content,
-- not code. Keyed by notification event; the subject (and, as builders adopt them,
-- preheader/intro/signoff) override the hardcoded defaults with {{token}} variables.
-- Storefront send path reads the override (DB→default fallback), so a seasonal
-- subject line changes without a deploy.

create table if not exists public.email_templates (
  key        varchar(60) primary key,   -- notification event, e.g. order.confirmed
  subject    text,                       -- override subject ({{orderNumber}} tokens)
  preheader  text,
  intro      text,
  signoff    text,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
grant all on public.email_templates to service_role;
