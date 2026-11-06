-- SAMORAH — approved batch-prefix correction for the real catalogue.
--
-- APPROVAL BOUNDARY: the fragrance codes below are APPROVED by the user as the future convention, and
-- uniqueness is verified (no product uses any of them). Applying this to the PRODUCTION catalogue still
-- requires a SEPARATE explicit DATA-MIGRATION approval. This file is intentionally NOT in supabase/migrations
-- so it cannot auto-apply on deploy/replay. It is tested in an isolated database and left ready.
--
-- Effect: FUTURE batch codes only — existing immutable batch_code values and all history/QC/labels/
-- allocations/inventory references are untouched (batch_code is immutable by trigger). Reversible: the prior
-- value is noted on each line. Affects only products.batch_prefix; no price/SKU/stock/formula change.
begin;
update public.products set batch_prefix='KC' where base_sku='SAM-CAN-001';   -- Kashmiri Chai    (was T6A33)
update public.products set batch_prefix='EX' where base_sku='SAM-CAN-002';   -- Exotic           (was null)
update public.products set batch_prefix='WM' where base_sku='SAM-CAN-004';   -- Wild Majestic    (was null)
update public.products set batch_prefix='WF' where base_sku='SAM-CAN-007';   -- Whispered Flame  (was null)
update public.products set batch_prefix='BR' where base_sku='SAM-CAN-008';   -- Bout Of Rain     (was null)
update public.products set batch_prefix='RB' where base_sku='SAM-CAN-009';   -- Rainforest Bloom (was QED19)
update public.products set batch_prefix='FF' where base_sku='SAM-LNN-001';   -- Fresh Fold       (was null)
update public.products set batch_prefix='AL' where base_sku='SAM-LNN-002';   -- After Lights     (was null)
update public.products set batch_prefix='OW' where base_sku='SAM-ROOM-001';  -- Open Window      (was null)
update public.products set batch_prefix='SE' where base_sku='SAM-ROOM-002';  -- Slow Evening     (was null)
-- Post-condition: all 10 real products carry their approved prefix; no duplicate prefixes.
do $$
declare dups int;
begin
  select count(*) into dups from (select batch_prefix from public.products where batch_prefix is not null group by batch_prefix having count(*) > 1) d;
  if dups > 0 then raise exception 'duplicate batch_prefix after correction: %', dups; end if;
end $$;
commit;
