-- Returns Resolution Center — resolution reason (review priority 3).
-- A short free-text WHY behind the chosen resolution (e.g. "Return cost exceeds product value"),
-- so future staff / a chargeback review can see the rationale, not just the outcome. Additive:
-- pairs with the existing resolution / resolution_by / resolved_at trio. No backfill needed.
alter table public.returns add column if not exists resolution_reason text;
comment on column public.returns.resolution_reason is 'Free-text rationale for the chosen resolution (priority 3) — shown beside resolution on the detail page.';
