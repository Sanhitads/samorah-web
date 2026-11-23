-- Per-variant product images for the PDP gallery.
--
-- Associates a gallery image with a specific variant (vessel + size) so the storefront gallery can
-- swap photos when the customer selects a vessel/size (e.g. Glass·190g vs Ceramic·100g). A NULL
-- variant_id is a SHARED/DEFAULT image that shows for any selection — and remains the behaviour for
-- every image that existed before this migration, so existing products are unchanged.
--
-- Purely additive: a new nullable column + supporting index, no data change, no privilege change.
-- RLS is unchanged (public read is still gated by the parent product's active status via the existing
-- "product_images public read" policy). On variant delete, that variant's images are removed with it
-- (they are specific to that vessel+size); the shared/default images (variant_id NULL) are untouched.
--
-- NOTE on primaries: the existing partial unique index product_images_one_primary_per_product
-- (on product_id where is_primary) stays valid because per-variant images are never is_primary — the
-- single primary (card thumbnail / default lead image) remains a product-level, variant_id-NULL image.
-- Per-variant image order is driven purely by sort_order.
alter table public.product_images
  add column if not exists variant_id uuid references public.variants(id) on delete cascade;

create index if not exists product_images_variant_id_idx on public.product_images(variant_id);

comment on column public.product_images.variant_id is
  'Variant (vessel+size) this gallery image belongs to; NULL = shared/default image shown for any selection.';
