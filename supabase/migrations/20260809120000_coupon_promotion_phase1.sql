-- Coupon & Promotions — Production Completion, Phase 1 (additive schema ONLY; no behaviour change).
--
-- This migration ONLY adds structure. It changes no existing rows and no existing code path: every new
-- column is nullable or safely defaulted, the new enum value is unused until the engine opts in, and the
-- two new tables start empty (a coupon with zero target rows keeps its current "entire order" behaviour).
-- Behaviour (targeting/exclusions/redemption/lifecycle) is wired in LATER, dependency-first, so this file
-- can be reviewed and applied on its own with no risk to live pricing/checkout/orders.
--
-- Design decisions (from the approved Phase-1 plan):
--  • Gift cards / bundles are NOT modelled as coupon targets. Bundles are identified by the existing
--    authoritative `order_items.composition_id` / line `compositionId`; gift cards by `product_type`.
--    Only real catalogue relationships (category/collection/product/variant) + the canonical product_type
--    string are coupon targets.
--  • coupon_targets uses PER-TYPE FK columns (not a polymorphic target_id) specifically to PRESERVE
--    REFERENTIAL INTEGRITY (real FKs + ON DELETE CASCADE) — the overriding requirement. A CHECK ties the
--    populated column to `target_type`; product_type carries the canonical string (no table to FK).
--  • The redemption ledger is lifecycle-stateful (consumed/released/restored), never delete-on-release,
--    so it retains full audit history. `coupons.used_count` stays as the fast counter and is mutated
--    ATOMICALLY with the ledger inside finalize/cancel (wired in a later step), never independently.

-- 1) New discount type: free shipping (affects shipping only; never product taxable value).
--    Additive enum value — unused until mapCoupon emits a free_shipping promotion (later step).
alter type public.coupon_type add value if not exists 'free_shipping';

-- 2) Stacking / priority config on coupons. Safe defaults reproduce today's behaviour exactly:
--    combinable=false → a coupon never stacks with another coupon or the auto Composition promo;
--    priority=100 → applied after the evergreen Composition rule (priority 10). Both are advisory until
--    the engine reads them (replacing the values currently hardcoded in couponService.mapCoupon).
alter table public.coupons add column if not exists combinable boolean not null default false;
alter table public.coupons add column if not exists priority   integer not null default 100;
comment on column public.coupons.combinable is 'May this coupon combine with other discounts? Default false = never stacks (safe).';
comment on column public.coupons.priority   is 'Tie-breaker for auto-apply/stacking; lower = applied first. Composition rule = 10.';

-- 3) Persist the per-promotion forensic breakdown on the order snapshot (why each ₹ was taken), so
--    reporting/refund never has to recompute and historical orders never depend on the live coupon row.
--    Nullable; create_pending_order is taught to write it in a later step.
alter table public.orders add column if not exists promotions jsonb;
comment on column public.orders.promotions is 'Immutable per-promotion breakdown snapshot (code/kind/amount/lines) at order time.';

-- 4) coupon_targets — include/exclude rules by REAL catalogue relationship (or canonical product_type).
--    Zero include rows = entire eligible order (backward-compatible). Explicit exclude always wins over
--    include (enforced in the engine, later step). Per-type FK columns preserve referential integrity.
create table if not exists public.coupon_targets (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons(id)     on delete cascade,
  mode          text not null check (mode in ('include', 'exclude')),
  target_type   text not null check (target_type in ('category', 'collection', 'product', 'product_type', 'variant')),
  category_id   uuid references public.categories(id)  on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,   -- "chapter" = collection
  product_id    uuid references public.products(id)    on delete cascade,
  variant_id    uuid references public.variants(id)    on delete cascade,
  product_type  text,                                                        -- canonical string, no FK table
  created_at    timestamptz not null default now(),
  -- Exactly the ONE column matching target_type is non-null; every other target column is null.
  constraint coupon_targets_shape check (
    (target_type = 'category'     and category_id   is not null and collection_id is null and product_id is null and variant_id is null and product_type is null) or
    (target_type = 'collection'   and collection_id is not null and category_id   is null and product_id is null and variant_id is null and product_type is null) or
    (target_type = 'product'      and product_id    is not null and category_id   is null and collection_id is null and variant_id is null and product_type is null) or
    (target_type = 'variant'      and variant_id    is not null and category_id   is null and collection_id is null and product_id is null and product_type is null) or
    (target_type = 'product_type' and product_type  is not null and category_id   is null and collection_id is null and product_id is null and variant_id is null)
  )
);
-- Prevent duplicate rules (same coupon + mode + concrete target). Version-agnostic: the shape CHECK
-- guarantees exactly one target column is non-null, so coalescing the four uuid columns yields the single
-- concrete id (or a sentinel for product_type rows), and product_type is coalesced to '' — so two
-- otherwise-identical rules collide regardless of which columns are null.
create unique index if not exists coupon_targets_uniq on public.coupon_targets (
  coupon_id, mode, target_type,
  coalesce(category_id, collection_id, product_id, variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(product_type, '')
);
create index if not exists coupon_targets_coupon_idx on public.coupon_targets (coupon_id);
comment on table public.coupon_targets is 'Coupon applies-to (include) / exclusion rules by catalogue relationship or product_type. Zero include rows = entire order.';

-- 5) coupon_redemptions — lifecycle-stateful ledger (the authoritative per-customer usage record + audit
--    trail). One row per redemption; released/restored are STATE changes, never deletes. Identity is the
--    authed user_id when present, else the normalized guest email — captured in `identity` for the
--    per-customer cap. Written atomically with coupons.used_count inside finalize/cancel (later step).
create table if not exists public.coupon_redemptions (
  id               uuid primary key default gen_random_uuid(),
  coupon_id        uuid references public.coupons(id) on delete set null,   -- history survives coupon delete
  coupon_code      text not null,                                           -- snapshot (survives delete)
  order_id         uuid references public.orders(id)  on delete set null,
  user_id          uuid references public.users(id)   on delete set null,   -- authed identity (preferred)
  email_normalized text,                                                    -- guest identity (lower+trim)
  identity         text not null,                                           -- coalesce(user_id, 'guest:'||email) — per-customer key
  discount_paise   integer not null default 0 check (discount_paise >= 0),  -- benefit actually granted
  state            text not null default 'consumed' check (state in ('consumed', 'released', 'restored')),
  consumed_at      timestamptz not null default now(),
  released_at      timestamptz,
  reason           text,                                                    -- mandatory on release/restore
  actor_type       text,                                                    -- 'staff' | 'system' | 'webhook'
  actor_id         uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx   on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_order_idx    on public.coupon_redemptions (order_id);
create index if not exists coupon_redemptions_identity_idx on public.coupon_redemptions (coupon_id, identity);
-- Fast "active redemptions for this customer on this coupon" lookup for the per-customer cap check.
create index if not exists coupon_redemptions_active_idx
  on public.coupon_redemptions (coupon_id, identity) where state in ('consumed', 'restored');
comment on table public.coupon_redemptions is 'Lifecycle-stateful coupon redemption ledger (consumed/released/restored). Authoritative per-customer usage + audit; mutated atomically with coupons.used_count.';

create trigger trg_coupon_redemptions_updated_at before update on public.coupon_redemptions
  for each row execute function public.set_updated_at();

-- 6) RLS + grants — mirror the existing coupons model. Staff (is_manager) read; managers write targets;
--    redemptions are written only by the server (service_role / SECURITY DEFINER RPCs), staff read-only.
alter table public.coupon_targets     enable row level security;
alter table public.coupon_redemptions enable row level security;

create policy "coupon_targets staff read"    on public.coupon_targets     for select to authenticated using (public.is_manager());
create policy "coupon_targets manager write" on public.coupon_targets     for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "coupon_redemptions staff read" on public.coupon_redemptions for select to authenticated using (public.is_manager());

grant select, insert, update, delete on table public.coupon_targets     to service_role;
grant select, insert, update, delete on table public.coupon_redemptions to service_role;
grant select, insert, update, delete on table public.coupon_targets     to authenticated; -- gated by RLS above
grant select                          on table public.coupon_redemptions to authenticated; -- gated by RLS above
