-- Navigation predecessor tracking (Phase 1 · points 10·11) — deterministic "revert to the revision this
-- publication displaced" on scheduled unpublish, WITHOUT guessing chronological order (a scheduled-but-
-- never-activated revision can sit between the displaced revision and the new one, so 2nd-newest ≠ displaced).
--
-- Two nullable FK pointers INTO the existing immutable cms_revisions store (no new snapshot system):
--   published_revision_id    — the revision currently live
--   predecessor_revision_id  — the revision this live publication displaced (the revert target on unpublish)
--
-- Set at publish; scheduled activation/deactivation is materialized ATOMICALLY + audited by
-- /api/cron/cms-schedule, which reverts `published` to the predecessor revision's snapshot on unpublish_at
-- (falling back to the code-config default only when no predecessor exists — the storefront is never left
-- without navigation). Revisions stay immutable; only WHICH revision is active changes.

alter table public.navigation_menus add column if not exists published_revision_id   uuid references public.cms_revisions(id) on delete set null;
alter table public.navigation_menus add column if not exists predecessor_revision_id uuid references public.cms_revisions(id) on delete set null;

comment on column public.navigation_menus.published_revision_id   is 'cms_revisions id currently live (Phase 1 pt 10/11)';
comment on column public.navigation_menus.predecessor_revision_id is 'cms_revisions id this publication displaced — revert target on scheduled unpublish';
