-- ============================================================================
-- SECURITY FIX — revoke PUBLIC/anon/authenticated EXECUTE on the coupon RPCs
-- ============================================================================
-- Discovered during the deployment-hardening review (2026-10-16).
--
-- PROBLEM
--   reserve_coupon / consume_coupon / release_coupon / restore_coupon are
--   SECURITY DEFINER functions (they run with the owner's rights and bypass
--   RLS to mutate coupons.used_count and the coupon_redemptions ledger). They
--   were GRANTed to service_role but, unlike every other money/order/inventory
--   RPC (finalize_order, reserve_stock, adjust_inventory, create_pending_order,
--   which are all revoked from public/anon/authenticated), these four were
--   NEVER revoked. Postgres grants EXECUTE to PUBLIC by default, so the public
--   anon key — which ships in every browser bundle — could invoke them directly
--   via PostgREST (/rest/v1/rpc/consume_coupon, etc.) and tamper with coupon
--   redemption state with no authentication.
--
-- VERIFIED (local): before this migration, has_function_privilege('anon', fn,
--   'EXECUTE') = true for all four; for finalize_order/reserve_stock it is false.
--
-- FIX
--   Revoke EXECUTE from PUBLIC, anon, and authenticated on all four. The app is
--   UNAFFECTED: src/services/couponRedemptionService.ts calls every one of these
--   through createAdminClient() (service_role), which retains EXECUTE. This only
--   removes the unauthenticated/raw-PostgREST path.
--
-- Idempotent and safe to re-run (REVOKE of an absent privilege is a no-op).
-- Forward-only, non-destructive: no data is touched, only function privileges.
-- ============================================================================

revoke all on function public.reserve_coupon(p_order_id uuid, p_coupon_code text, p_identity text, p_user_id uuid, p_email text, p_benefit_paise integer)
  from public, anon, authenticated;

revoke all on function public.consume_coupon(p_order_id uuid)
  from public, anon, authenticated;

revoke all on function public.release_coupon(p_order_id uuid, p_reason text, p_actor_type text, p_actor_id uuid)
  from public, anon, authenticated;

revoke all on function public.restore_coupon(p_order_id uuid, p_reason text, p_actor_id uuid)
  from public, anon, authenticated;

-- Keep service_role able to execute them (the app's only legitimate caller).
grant execute on function public.reserve_coupon(p_order_id uuid, p_coupon_code text, p_identity text, p_user_id uuid, p_email text, p_benefit_paise integer) to service_role;
grant execute on function public.consume_coupon(p_order_id uuid) to service_role;
grant execute on function public.release_coupon(p_order_id uuid, p_reason text, p_actor_type text, p_actor_id uuid) to service_role;
grant execute on function public.restore_coupon(p_order_id uuid, p_reason text, p_actor_id uuid) to service_role;
