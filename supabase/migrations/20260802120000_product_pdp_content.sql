-- Candle-PDP CMS extras (review: the candle PDP is the richest page — Story, Fragrance Journey, Scent
-- Mood, Craft, Artist, Artwork, Lifestyle, Testimonials, Details accordion — and most of it is fully
-- editable via real product columns. The remaining bespoke, per-product presentation bits (custom
-- colour palette / gradient, renamed section headings, an overridden/extended Details accordion, and
-- later: section-specific images, custom sections, per-product testimonials) don't fit a fixed column
-- each. One JSONB blob holds them, mirroring air_content. Additive; air products ignore it.)
alter table public.products add column if not exists pdp_content jsonb;
comment on column public.products.pdp_content is 'Candle-PDP CMS extras: { customPalette:{surface,ink}, customGradient:{from,to,angle}, labels:{...section eyebrows/headings}, accordion:[{title,body}], customSections:[...], storyImage, lifestyleImage, artworkImage, testimonials:[{quote,attribution}] }. Null = house defaults.';
