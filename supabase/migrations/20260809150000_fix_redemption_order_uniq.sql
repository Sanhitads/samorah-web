-- Fix: the coupon_redemptions order_id unique index was created PARTIAL (where order_id is not null),
-- which ON CONFLICT (order_id) in reserve_coupon can't infer (error 42P10). Recreate it non-partial —
-- NULLs are distinct by default in Postgres, so multiple purged-order rows still coexist, and non-null
-- order_ids remain unique. (The previous migration file is corrected too, for fresh setups.)
drop index if exists public.coupon_redemptions_order_uniq;
create unique index if not exists coupon_redemptions_order_uniq on public.coupon_redemptions (order_id);
