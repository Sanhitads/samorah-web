-- Coupon & Promotions Phase 1 — sale-item exclusion flag (additive; default false = no change).
-- "Sale products" isn't a catalogue relationship, so it can't be a coupon_targets row (those are
-- category/collection/product/product_type/variant). It's an intrinsic per-line property, so it's a
-- boolean on the coupon: when true, currently sale-priced lines are excluded from the coupon (an
-- explicit exclusion, which always wins). Gift-card and bundle/composition lines are excluded
-- intrinsically by the engine (no flag needed) per the approved Phase-1 policy.
alter table public.coupons add column if not exists exclude_sale boolean not null default false;
comment on column public.coupons.exclude_sale is 'Exclude currently sale-priced lines from this coupon (explicit exclusion; default false).';
