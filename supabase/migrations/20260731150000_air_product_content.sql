-- Air-product PDP content (review: room/linen fresheners have a different, richer PDP — The Hour,
-- Feels Like, The Experience, Placement, Signature — and lived only in config/theHours. This makes
-- them DB-managed so a room/linen freshener is fully admin-editable and renders the air PDP from the
-- database.) One JSONB blob holds the bespoke air fields; the shared fields (name, tagline, price,
-- variants, images, collection) stay on the normal product columns. Additive; candles ignore it.
alter table public.products add column if not exists air_content jsonb;
comment on column public.products.air_content is 'Air-PDP content for room/linen fresheners: { time, moment, heroLine, hourReason, hourStory, scentEffect, composition, scent[], feels[], experience, placement[{label,note}], signature }. Null for candles.';

-- Air volumes are chapters too — the collections table already carries volume/tagline/cover/
-- is_coming_soon, so an air volume (e.g. "The Everyday") is just a collection whose products are
-- room/linen fresheners. No collection change needed here.
