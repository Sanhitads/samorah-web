-- Per-route structured data / JSON-LD (Phase 7 · point 31). Adds an optional custom JSON-LD blob to the
-- SEO overrides, rendered as <script type="application/ld+json"> on the matching route (on top of the
-- automatic global Organization + WebSite schema). Nullable; the SEO service reads/writes it resiliently
-- so metadata keeps working before this migration runs.
alter table public.seo_overrides add column if not exists structured_data jsonb;

comment on column public.seo_overrides.structured_data is 'Optional custom JSON-LD for the route (Phase 7 #31).';
