-- ============================================================================
-- Inventory Authority switch (Phase 1A)
--
-- Makes the Phase-0 ledger the SOLE writer of physical on-hand and gives every new
-- variant a deterministic ledger start — enforced in the database, not just the UI.
--
-- (1) AFTER INSERT trigger on variants → one atomic 'opening_balance' movement per new
--     variant (even stock=0), so creation and ledger start are one transaction (req #2).
-- (2) Column-privilege switch: revoke UPDATE(stock) on variants from the API role, so a
--     direct UPDATE of on-hand is refused regardless of app code (req #1). The canonical
--     path (apply_stock_movement) is SECURITY DEFINER owned by the migration role, which
--     owns the table and therefore bypasses this grant — it keeps working.
--
-- Phase-0 objects are NOT modified (no invariant change).
-- ============================================================================

-- ── (1) Opening-balance-on-create trigger ────────────────────────────────────
create or replace function public.variants_ledger_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotent: the Phase-0 backfill / a re-insert of the same id never double-anchors.
  if not exists (select 1 from public.inventory_movements where idempotency_key = 'opening:' || new.id::text) then
    insert into public.inventory_movements(
      variant_id, variant_ref, sku_snapshot, product_name_snapshot, variant_name_snapshot,
      quantity_before, quantity_delta, quantity_after, movement_type, source_type, idempotency_key, note
    )
    select new.id, new.id, new.sku, p.name, new.variant_name,
           0, new.stock, new.stock, 'opening_balance', 'system',
           'opening:' || new.id::text, 'Opening balance (variant created)'
      from public.products p where p.id = new.product_id;
  end if;
  return new;
end $$;

drop trigger if exists variants_opening_balance_trg on public.variants;
create trigger variants_opening_balance_trg
  after insert on public.variants
  for each row execute function public.variants_ledger_opening();

-- ── (2) Column-privilege authority switch ────────────────────────────────────
-- A table-level UPDATE grant covers every column, so revoking UPDATE(stock) alone is
-- insufficient — we drop the table-level UPDATE and re-grant UPDATE on every column
-- EXCEPT stock. Done dynamically so we needn't hand-maintain the column list.
-- NOTE: a future migration that ADDS a variants column must re-grant UPDATE on it to
-- service_role (or re-run this pattern); stock stays intentionally ungranted.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'variants' and column_name <> 'stock';
  execute 'revoke update on public.variants from service_role';
  execute format('grant update (%s) on public.variants to service_role', cols);
end $$;
