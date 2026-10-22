-- ============================================================================
-- HARDENING — empty search_path for the SECURITY DEFINER functions
-- ============================================================================
-- Forward migration (2026-10-17). The three SECURITY DEFINER functions created
-- by 20261016140000 and 20261016150000 pinned `set search_path to 'public'`.
-- This replaces that with the STRICTER `set search_path = ''` (empty) plus
-- fully schema-qualified references — the Supabase-recommended definer hardening.
--
-- WHY EMPTY IS STRICTER
--   With an empty search_path NOTHING is resolved implicitly — not even `public`
--   — so no object planted in any schema that happens to be on a caller's search
--   path can shadow an unqualified reference inside a SECURITY DEFINER function
--   (which runs as the function owner). pg_catalog is still resolved implicitly
--   (it always is), so built-ins remain available; we qualify the real catalog
--   FUNCTIONS (now/make_interval/gen_random_uuid) with pg_catalog for explicitness.
--   GREATEST / COALESCE / INTERVAL literals / casts are SQL grammar, not schema
--   objects, so they are (and must be) left unqualified.
--
-- NOT A HISTORY EDIT
--   The 2026-10-16 migrations are ALREADY APPLIED on production; their files are
--   not touched. This is an additive CREATE OR REPLACE with identical signatures,
--   so it is backward-compatible and changes no data. CREATE OR REPLACE preserves
--   privileges; the revoke/grant is re-asserted so the file is self-contained.
--   Proven locally with `npm run db:reset` + a smoke call of all three functions.
--   Forward-only, service_role-only. DO NOT apply to production without approval.
--
-- ONE BEHAVIOR CHANGE (claim_due_notifications): the stranded-'retrying' reclaim now
--   falls back to last_attempt_at when claimed_at is NULL, so rows stranded by a
--   terminal-write failure on the MANUAL retry / DLQ-replay paths (which never take a
--   claim lease) are recovered too — previously only lease-holding worker rows were.
--   Strict superset of the prior condition; no row recoverable before is now skipped.
-- ============================================================================

create or replace function public.claim_due_notifications(p_limit integer)
returns setof public.notification_log
language sql
security definer
set search_path = ''
as $$
  update public.notification_log n
  -- Revive a row stranded in-flight: 'retrying' (crashed during a RETRY) or 'sending' (crashed during
  -- the INITIAL attempt, after openLog but before closeLog) → back to 'failed' so the worker re-dispatches.
  set status = case when n.status in ('retrying', 'sending') then 'failed' else n.status end,
      -- A revived 'sending' row has no next_retry_at yet → make it due now so retryDecision retries it.
      next_retry_at = case when n.status = 'sending' then pg_catalog.now() else n.next_retry_at end,
      -- Count each revival as an attempt so a pathological crash-after-accept loop is BOUNDED: after
      -- maxAttempts revivals retryDecision() sends it to the DLQ instead of re-dispatching forever.
      attempts = case when n.status in ('retrying', 'sending') then coalesce(n.attempts, 1) + 1 else n.attempts end,
      claimed_at = pg_catalog.now()
  where n.id in (
    select id
    from public.notification_log
    where (
      (status in ('failed', 'queued') and next_retry_at is not null and next_retry_at <= pg_catalog.now()
         and (claimed_at is null or claimed_at < pg_catalog.now() - interval '15 minutes'))
      or
      -- Reclaim a stranded 'retrying' row. Worker-path rows carry a claim lease (claimed_at); the MANUAL
      -- retry / DLQ-replay paths never claim, so if their terminal write fails the row is stranded in
      -- 'retrying' with claimed_at NULL. Fall back to last_attempt_at (stamped by the 'retrying' marker)
      -- so those orphans are recovered too, not only lease-holding worker rows.
      (status = 'retrying' and coalesce(claimed_at, last_attempt_at) is not null
         and coalesce(claimed_at, last_attempt_at) < pg_catalog.now() - interval '15 minutes')
      or
      -- stranded INITIAL attempt: 'sending' with no claim lease, stuck past the window (last_attempt_at
      -- is stamped by openLog). The idempotency key makes re-dispatch safe (provider de-dups within 24h).
      (status = 'sending' and last_attempt_at is not null and last_attempt_at < pg_catalog.now() - interval '15 minutes')
    )
    order by next_retry_at asc nulls last
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning n.*;
$$;

create or replace function public.try_acquire_cron_lock(p_job text, p_ttl_seconds integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate text := pg_catalog.gen_random_uuid()::text;   -- DB-generated owner token
  v_result    text;
begin
  insert into public.cron_locks (job, holder, locked_until)
  values (p_job, v_candidate, pg_catalog.now() + pg_catalog.make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (job) do update
    set holder = excluded.holder, locked_until = excluded.locked_until
    where public.cron_locks.locked_until < pg_catalog.now()   -- only steal an EXPIRED lease
  returning holder into v_result;
  return v_result;   -- the token if acquired, NULL if a live lease is held by someone else
end;
$$;

create or replace function public.release_cron_lock(p_job text, p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.cron_locks set locked_until = pg_catalog.now()
  where job = p_job and holder = p_token   -- FENCING: only the current owner may release
  returning true;
$$;

-- CREATE OR REPLACE preserves privileges; re-assert them so the file stands alone.
revoke all on function public.claim_due_notifications(integer) from public, anon, authenticated;
revoke all on function public.try_acquire_cron_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_cron_lock(text, text) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(integer) to service_role;
grant execute on function public.try_acquire_cron_lock(text, integer) to service_role;
grant execute on function public.release_cron_lock(text, text) to service_role;
