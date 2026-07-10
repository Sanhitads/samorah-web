-- Profit reporting (R10) — per-variant cost of goods (COGS input).
-- The unit cost we pay to make/buy a variant. Used by the Profit report to turn
-- revenue into margin. Defaults to 0 so existing rows are valid; a variant with
-- cost 0 is flagged in the report as "missing cost" so profit is never silently
-- overstated. Cost is NOT exposed to the storefront — admin/reporting only.

alter table public.variants
  add column if not exists cost_price numeric(10,2) not null default 0;
