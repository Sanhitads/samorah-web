-- Collection / Chapter CMS (review: the biggest architectural gap — chapters could only be changed in
-- code). The collections table already carries name, slug, volume, tagline, poetic_line, description,
-- cover_image_url, hero_product_id, seo_title, seo_description, sort_order, is_active, is_coming_soon.
-- This adds the remaining editorial fields the chapter page + admin editor want so a new chapter
-- (e.g. "Monsoon Library") can be launched without a developer.
alter table public.collections add column if not exists hero_mobile_url text;
alter table public.collections add column if not exists intro text;
alter table public.collections add column if not exists story_long text;
alter table public.collections add column if not exists seo_og_image text;
comment on column public.collections.intro is 'Short chapter introduction shown above the product grid.';
comment on column public.collections.story_long is 'Long-form chapter narrative (editorial body).';
