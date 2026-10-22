-- ============================================================================
-- SECURITY FIX — revoke PUBLIC/anon/authenticated EXECUTE on analytics_refresh_mvs()
-- ============================================================================
-- Found during the deployment-hardening SECURITY DEFINER audit (2026-10-16).
--
-- analytics_refresh_mvs() is SECURITY DEFINER, takes no args, and runs two
-- `REFRESH MATERIALIZED VIEW CONCURRENTLY` statements. It was executable by
-- public/anon/authenticated, so the public anon key (in every browser bundle)
-- could POST /rest/v1/rpc/analytics_refresh_mvs repeatedly and force expensive
-- concurrent MV refreshes — an unauthenticated resource-abuse / DoS vector.
--
-- Its only legitimate caller is the analytics-refresh cron, which runs it via
-- createAdminClient() (service_role). Revoking the public grant is therefore
-- safe and does not change cron behaviour.
--
-- Idempotent; forward-only; no data touched.
-- ============================================================================

revoke all on function public.analytics_refresh_mvs() from public, anon, authenticated;
grant execute on function public.analytics_refresh_mvs() to service_role;
