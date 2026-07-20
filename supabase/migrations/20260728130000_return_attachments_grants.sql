-- ============================================================================
-- Grants for return_attachments.
--
-- The prior migration created public.return_attachments with RLS ON. On this project
-- the standard per-table grants to the PostgREST roles did not auto-apply, so the
-- admin server (service_role) got a 42501 "insufficient privilege" on SELECT.
--
-- Grant the roles explicitly (matching every other table). RLS stays ON with NO
-- client policy, so anon/authenticated remain default-deny at the row level; only the
-- service-role admin server reaches rows (it bypasses RLS AND now has the grant).
-- Idempotent — GRANT is safe to re-run.
-- ============================================================================

grant all on public.return_attachments to service_role;
grant all on public.return_attachments to postgres;
grant select, insert, update, delete on public.return_attachments to authenticated;
grant select on public.return_attachments to anon;
