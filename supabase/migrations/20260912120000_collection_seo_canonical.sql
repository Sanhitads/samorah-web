-- Per-collection canonical URL — parity with products.seo_canonical.
--
-- The chapter/collection page can now declare its own canonical (e.g. to point .in/.co variants at the
-- primary .com URL, or to consolidate a duplicate). Nullable + additive: blank falls back to the page's
-- own route, so nothing changes for existing collections until an admin sets a value.
alter table public.collections
  add column if not exists seo_canonical text;

comment on column public.collections.seo_canonical is
  'Canonical URL for the chapter/collection page. NULL/empty = the page''s own route.';
