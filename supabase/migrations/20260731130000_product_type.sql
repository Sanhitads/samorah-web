-- Product type (review: multiple product types — candle, room freshener, linen freshener, and future
-- wax tablets / diffusers). Classifies a product so the storefront can eventually pick the right PDP
-- experience per type (candle PDP vs the air/spray PDP) from the DB rather than config. Additive;
-- defaults every existing product to 'candle'. Variant barcode / weight_grams / low_stock_threshold
-- already exist — no change there; size_label already holds "100g" and can hold "100ml".
alter table public.products add column if not exists product_type text not null default 'candle';
comment on column public.products.product_type is 'candle | room_spray | linen_spray | wax_tablet | reed_diffuser | other — drives the PDP experience.';
