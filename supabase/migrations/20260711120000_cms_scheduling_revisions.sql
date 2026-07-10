-- CMS — Scheduled publish/unpublish (R7) + Revision history (R3).
--
-- Scheduling: a page carries an optional [publish_at, unpublish_at) visibility
-- window. Visibility is computed at READ time (no cron) — a page goes live the
-- moment now() crosses publish_at and hides at unpublish_at — so it's always
-- current and never depends on a scheduler firing. A new 'scheduled' status lets
-- an editor stage a page that isn't live yet but will auto-publish at publish_at.
--
-- Revisions: every committed version of a page is snapshotted into
-- cms_page_revisions, so any prior version can be restored (restore writes the old
-- content back as a new current version — non-destructive, itself snapshotted).

alter table public.cms_pages
  add column if not exists publish_at   timestamptz,
  add column if not exists unpublish_at timestamptz;

-- Allow a staged-but-not-yet-live status alongside draft/published.
alter table public.cms_pages drop constraint if exists cms_pages_status_check;
alter table public.cms_pages
  add constraint cms_pages_status_check check (status in ('draft','scheduled','published'));

create table if not exists public.cms_page_revisions (
  id           uuid primary key default gen_random_uuid(),
  slug         varchar(120) not null,
  title        varchar(200) not null,
  eyebrow      varchar(80),
  intro        text,
  sections     jsonb not null default '[]'::jsonb,
  seo          jsonb not null default '{}'::jsonb,
  status       varchar(20) not null default 'published',
  publish_at   timestamptz,
  unpublish_at timestamptz,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);

create index if not exists cms_page_revisions_slug_idx on public.cms_page_revisions (slug, created_at desc);

alter table public.cms_page_revisions enable row level security;
grant all on public.cms_page_revisions to service_role;
