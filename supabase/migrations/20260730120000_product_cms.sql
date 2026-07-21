-- Product CMS (review: evolve Products into the editorial CMS). Additive merchandising flags,
-- visibility controls, chapter position, and SEO OG/canonical. The rich editorial columns the
-- storefront already reads (collection_id, story, story_long, flame_persona, cultural_reference,
-- lifestyle_use, mood_tags, wax_blend, wick, burn_time, scent_group, fragrance_family, seo_title,
-- seo_description, is_hero, is_featured, publish_at, allow_backorder) already exist — this only adds
-- what's genuinely missing so the editor can drive merchandising + visibility per product.

-- Merchandising flags (is_featured + is_hero already exist).
alter table public.products add column if not exists is_bestseller boolean not null default false;
alter table public.products add column if not exists is_new_arrival boolean not null default false;
alter table public.products add column if not exists is_limited_edition boolean not null default false;
alter table public.products add column if not exists is_seasonal boolean not null default false;
alter table public.products add column if not exists is_staff_pick boolean not null default false;
alter table public.products add column if not exists is_coming_soon boolean not null default false;

-- Visibility controls — where a product surfaces (status still gates active/draft/archived overall).
alter table public.products add column if not exists visible_website boolean not null default true;
alter table public.products add column if not exists visible_search boolean not null default true;
alter table public.products add column if not exists visible_homepage boolean not null default true;
alter table public.products add column if not exists visible_chapter boolean not null default true;
alter table public.products add column if not exists visible_bundles boolean not null default true;

-- Editorial placement within a chapter.
alter table public.products add column if not exists chapter_position text;   -- "1.1" → renders "No. 1.1"
alter table public.products add column if not exists display_order integer not null default 0;

-- SEO extras (seo_title + seo_description already exist).
alter table public.products add column if not exists seo_og_image text;
alter table public.products add column if not exists seo_canonical text;

comment on column public.products.chapter_position is 'Editorial position within the chapter (e.g. "1.1" → renders "No. 1.1" on the storefront).';
comment on column public.products.display_order is 'Sort order within the chapter grid (Continue the Chapter).';
