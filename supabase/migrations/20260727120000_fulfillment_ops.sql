-- ============================================================================
-- Fulfillment operations (warehouse Phase 1 + 3) — ADDITIVE, non-breaking.
--
--   · order_items.picked_qty     — per-item pick progress ("2 / 4 picked")
--   · orders.packing_checklist   — per-order packing-collateral completion (jsonb)
--   · orders.qc_by / qc_at       — first-class QC record (operator + timestamp)
--   · warehouses.daily_capacity  — capacity for the utilisation panel
--
-- All default-safe (no backfill needed): picked_qty 0, packing_checklist {},
-- qc_* null, daily_capacity null. No existing code path changes behaviour.
-- Idempotent (IF NOT EXISTS) so a re-run is safe.
-- ============================================================================

-- Pick progress (point 2) — how many of each line's units are picked.
alter table public.order_items
  add column if not exists picked_qty integer not null default 0;

-- Packing checklist (point 3) — { item_key: { done: bool, by: uuid, at: iso } }.
-- The item CATALOG (Product / Dust Bag / Thank You Card / Story Card / Care Card /
-- Gift Box / Invoice) is config-driven in code; this stores only per-order state.
alter table public.orders
  add column if not exists packing_checklist jsonb not null default '{}'::jsonb;

-- QC record (point 4) — the state machine already REQUIRES qc_passed before ship;
-- these give the pass a first-class operator + timestamp (audit_events still logs it too).
alter table public.orders
  add column if not exists qc_by uuid references public.users(id) on delete set null;
alter table public.orders
  add column if not exists qc_at timestamptz;

-- Warehouse capacity (point 17) — daily order capacity for the utilisation %.
alter table public.warehouses
  add column if not exists daily_capacity integer;

comment on column public.order_items.picked_qty is
  'Units picked of this line (0..quantity). Drives board pick progress "N/total".';
comment on column public.orders.packing_checklist is
  'Per-order packing-collateral completion: { item_key: {done,by,at} }. Catalog is code-config.';
comment on column public.orders.qc_by is 'Operator who passed QC (first-class QC record).';
comment on column public.orders.qc_at is 'When QC was passed.';
comment on column public.warehouses.daily_capacity is 'Daily order capacity for the utilisation panel; null = untracked.';
