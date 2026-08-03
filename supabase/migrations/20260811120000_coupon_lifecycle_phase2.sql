-- Coupon & Promotions — Phase 2 (Admin & Campaign Management), additive schema ONLY. Zero behaviour
-- change: every column is nullable or safely defaulted + backfilled from existing data, and NO existing
-- code path is touched by this migration (is_active still works untouched — the reader/writer migration
-- to `status` lands in the next step, together with the is_active→status sync trigger).
--
-- Locked decisions baked in here:
--  • Lifecycle intent `status` = draft|active|paused|archived. Scheduled/Expired/Exhausted are DERIVED
--    (couponStatus() helper, next step) — never stored. Backfill: is_active true→active, false→paused.
--  • Customer eligibility `everyone|first_order` (backfill from first_order_only). first_order will be
--    ENFORCED at application/repricing AND reservation (next steps) using the canonical PAID lifecycle.
--  • `min_qualifying_quantity` = eligible units AFTER targeting/exclusions (engine, next step).
--  • Customer-facing `public_description` (backfill from description) vs admin-only `internal_notes`
--    (stays NULL — never copy public text inward).

-- 1) Lifecycle intent. Default 'draft' for future raw inserts; existing rows backfilled from is_active.
alter table public.coupons add column if not exists status text not null default 'draft'
  check (status in ('draft', 'active', 'paused', 'archived'));
update public.coupons set status = case when is_active then 'active' else 'paused' end;
comment on column public.coupons.status is 'Lifecycle intent (draft|active|paused|archived). Scheduled/expired/exhausted are DERIVED, never stored. Authoritative from the reader-migration step; is_active is deprecated.';

-- 2) Customer eligibility (everyone|first_order today; segmentation is post-launch, not built).
alter table public.coupons add column if not exists eligibility text not null default 'everyone'
  check (eligibility in ('everyone', 'first_order'));
update public.coupons set eligibility = case when first_order_only then 'first_order' else 'everyone' end;
comment on column public.coupons.eligibility is 'everyone | first_order. first_order = no prior order with payment_status in (paid, partially_refunded, refunded).';

-- 3) Minimum qualifying quantity — eligible UNITS after targeting/exclusions (not SKUs, not cart total).
alter table public.coupons add column if not exists min_qualifying_quantity integer
  check (min_qualifying_quantity is null or min_qualifying_quantity >= 1);
comment on column public.coupons.min_qualifying_quantity is 'Optional. Min eligible units (post targeting/exclusions) for the coupon to apply. Bundles are not auto-decomposed (Phase-1 policy).';

-- 4) Customer-facing description vs internal notes. public_description is the ONLY customer-facing label
--    (falls back to code when empty). internal_notes must NEVER leave admin (audited across serializers).
alter table public.coupons add column if not exists public_description text;
alter table public.coupons add column if not exists internal_notes text;
update public.coupons set public_description = description where public_description is null;
comment on column public.coupons.public_description is 'Customer-facing promotion label (falls back to code). The ONLY description shown to customers.';
comment on column public.coupons.internal_notes is 'Admin-only campaign notes. MUST NEVER appear in any storefront/checkout/account/order/invoice/email/analytics/metadata payload.';

create index if not exists coupons_status_idx on public.coupons (status);
create index if not exists coupons_eligibility_idx on public.coupons (eligibility);
