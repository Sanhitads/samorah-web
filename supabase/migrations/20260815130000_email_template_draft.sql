-- Email templates become a draft→publish resource (no scheduling).
-- The scalar columns (subject/preheader/.../blocks/enabled) remain the PUBLISHED version that the
-- production send path reads; `draft` holds the in-progress edit until it is validated and published.
-- Version history reuses the shared cms_revisions store (resource_type = 'email').
alter table public.email_templates add column if not exists draft jsonb;
