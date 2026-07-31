-- Allow the service_role to delete section events (Phase 6 · point 26) — for retention / admin purge
-- (e.g. a future "clear analytics" or a scheduled trim). Applies on top of the earlier grants. Idempotent.
grant delete on table public.section_events to service_role;
