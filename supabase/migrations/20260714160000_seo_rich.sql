-- Richer SEO overrides (review point 3) — canonical URL + sitemap priority/changefreq
-- per route, layered over the global defaults. JSON-LD stays per-route in code (typed
-- structured data), keyed off the same override where useful.

alter table public.seo_overrides add column if not exists canonical        text;
alter table public.seo_overrides add column if not exists sitemap_priority numeric(2,1);
alter table public.seo_overrides add column if not exists change_freq       varchar(20);
