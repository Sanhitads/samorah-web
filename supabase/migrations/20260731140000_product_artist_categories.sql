-- Per-product Artist Story (review: the PDP's "The Samorah Artist" section was global config, not
-- editable). These columns let each product carry its own artist; the PDP falls back to the house
-- artist when artist_enabled is false. Additive.
alter table public.products add column if not exists artist_enabled boolean not null default false;
alter table public.products add column if not exists artist_name text;
alter table public.products add column if not exists artist_role text;
alter table public.products add column if not exists artist_story text;
alter table public.products add column if not exists artist_quote text;
alter table public.products add column if not exists artist_image text;

-- Seed the product-type categories so the editor's category dropdown isn't candles-only (review: the
-- dropdown showed only "Candles"). Idempotent — skips any slug that already exists.
insert into public.categories (id, name, slug, sku_prefix, default_hsn_code, default_gst_rate, is_active, sort_order)
select gen_random_uuid(), v.name, v.slug, v.sku_prefix, v.hsn, v.gst, true, v.sort
from (values
  ('Room Fresheners',  'room-fresheners',  'SAM-ROOM', '33074900', 18, 2),
  ('Linen Fresheners', 'linen-fresheners', 'SAM-LNN',  '33074900', 18, 3),
  ('Wax Tablets',      'wax-tablets',      'SAM-WAX',  '34060000', 12, 4),
  ('Reed Diffusers',   'reed-diffusers',   'SAM-REED', '33074900', 18, 5)
) as v(name, slug, sku_prefix, hsn, gst, sort)
where not exists (select 1 from public.categories c where c.slug = v.slug);
