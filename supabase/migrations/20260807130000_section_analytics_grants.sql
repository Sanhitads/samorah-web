-- Grants for section analytics (Phase 6 · point 26) — applied on top of 20260807120000, which created
-- the objects but (depending on default privileges) may not have granted the service_role access.
-- The server ingest route + admin reads use the service_role client; RLS stays policy-less so no other
-- role can touch the raw events. Idempotent.
grant select, insert on table public.section_events to service_role;
grant execute on function public.section_analytics(text, int) to service_role;
