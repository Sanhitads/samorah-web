-- ============================================================================
-- MANUFACTURING FOUNDATION — guards (corrective, additive) for Phase 3
-- ============================================================================
-- Found during Phase 2 verification. ADDITIVE and non-stock. Two guards:
--   1. manufacturing_batches.creation_idempotency_key — lets create_batch (Phase 3)
--      be idempotent against duplicate/retried creation requests (scope C.1).
--   2. batch_stock_entries: at most ONE overlay row per (movement_id, batch_id), so a
--      single authoritative inventory movement can be split across batches but a batch
--      can never be double-attributed to the same movement (verification #1). The
--      remaining overlay invariants (Σ overlay.qty = movement.delta; overlay.variant =
--      movement.variant) are DEFERRED to the Phase 6/7 posting RPC + reconciliation
--      helper + tests, since they only apply once posting exists (no overlay rows yet).
-- DO NOT apply to production without separate approval.
-- ============================================================================

-- 1. Idempotent batch creation key (partial-unique; null for rows created pre-Phase-3).
alter table public.manufacturing_batches
  add column if not exists creation_idempotency_key text;
create unique index if not exists mfg_batches_creation_idem_uidx
  on public.manufacturing_batches(creation_idempotency_key)
  where creation_idempotency_key is not null;

-- 2. One overlay entry per (authoritative movement, batch) — no duplicate attribution.
create unique index if not exists batch_stock_entries_movement_batch_uidx
  on public.batch_stock_entries(movement_id, batch_id)
  where movement_id is not null;
