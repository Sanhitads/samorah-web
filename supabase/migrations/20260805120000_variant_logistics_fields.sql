-- Batch C · point 4 — operational variant fields (logistics + procurement reference).
-- Additive + idempotent. cost_price (COGS) already exists (20260711130000); margin is derived in the
-- UI. These columns are optional operational metadata; the app strips them on a schema error so a save
-- never hard-fails before this migration is applied (see VARIANT_LOGISTICS_COLUMNS in productAdminService).
alter table public.variants
  add column if not exists shipping_class    varchar(40),                                                    -- courier handling class (e.g. "standard", "fragile", "hazmat")
  add column if not exists package_length_cm numeric(6,1) check (package_length_cm is null or package_length_cm >= 0),
  add column if not exists package_width_cm  numeric(6,1) check (package_width_cm  is null or package_width_cm  >= 0),
  add column if not exists package_height_cm numeric(6,1) check (package_height_cm is null or package_height_cm >= 0),
  add column if not exists supplier_sku      varchar(80);                                                    -- procurement reference (vendor's own SKU)
