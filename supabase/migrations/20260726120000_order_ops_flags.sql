-- ============================================================================
-- Order operational flags (admin Phase 2) — ADDITIVE, non-breaking.
--
-- Adds two first-class, schema-backed flags to `orders`:
--   · fraud_review — the fraud-review lifecycle
--   · wholesale    — B2B / wholesale classification
--
-- Both default to 'none', so every existing row is valid immediately and no
-- existing code path changes behaviour. Incident linkage is NOT added here — it
-- reuses the existing soft relationship (incident_notifications.order_number),
-- exposed read-only, per "do not redesign incidents". "Priority Fulfilment"
-- reuses the existing orders.priority field (vip/urgent), not a new column.
--
-- Idempotent (IF NOT EXISTS) so a re-run is safe.
-- ============================================================================

alter table public.orders
  add column if not exists fraud_review varchar(24) not null default 'none';

alter table public.orders
  add column if not exists wholesale varchar(20) not null default 'none';

-- Manual incident link (Phase 1 "Link Incident" bulk action). References an incident by its stable
-- number — reuses the incident domain, does not redesign it. Nullable; most orders have none.
alter table public.orders
  add column if not exists incident_number varchar(30);

-- Value guards. Added separately + guarded so a re-run doesn't error on an
-- already-present constraint.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_fraud_review_check') then
    alter table public.orders
      add constraint orders_fraud_review_check
      check (fraud_review in ('none','pending_review','under_investigation','cleared','confirmed_fraud'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_wholesale_check') then
    alter table public.orders
      add constraint orders_wholesale_check
      check (wholesale in ('none','wholesale_order','b2b_customer'));
  end if;
end $$;

-- Filter/sort indexes. Partial: the overwhelming majority of orders are 'none',
-- so we index only the flagged rows — small, fast, and exactly what the flag
-- filters query.
create index if not exists idx_orders_fraud_review
  on public.orders (fraud_review) where fraud_review <> 'none';
create index if not exists idx_orders_wholesale
  on public.orders (wholesale) where wholesale <> 'none';
create index if not exists idx_orders_incident_number
  on public.orders (incident_number) where incident_number is not null;

comment on column public.orders.fraud_review is
  'Fraud-review lifecycle: none|pending_review|under_investigation|cleared|confirmed_fraud. Drives Order Health (⚫) + the Fraud filter.';
comment on column public.orders.wholesale is
  'Wholesale/B2B classification: none|wholesale_order|b2b_customer. Priority fulfilment reuses orders.priority.';
