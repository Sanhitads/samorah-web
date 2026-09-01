-- Per-image focal point for product gallery images.
--
-- Stores a CSS object-position string ("50% 30%"); NULL/empty = centre (the default).
-- The storefront gallery (ProductGallery → AssetImage) applies it as object-position so the
-- important part of a photo stays in frame across the PDP's aspect ratios / crops, matching the
-- focal-point control the media-library sections already offer.
--
-- Purely additive: a new nullable column, no data change, no privilege change. product_images
-- carries the standard grants (unlike variants.stock, no column-level revoke applies here).
alter table public.product_images
  add column if not exists focal text;

comment on column public.product_images.focal is
  'CSS object-position for the gallery crop, e.g. "50% 30%". NULL/empty = centre.';
