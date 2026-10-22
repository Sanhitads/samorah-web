-- ============================================================================
-- CONCURRENCY FIX — atomic claim for the notification auto-retry worker
-- ============================================================================
-- Found during the deployment-hardening review (2026-10-16).
--
-- PROBLEM
--   runRetryWorker() (src/lib/notifications/opsEngine.ts) SELECTed all due
--   failed/queued notification_log rows and then dispatched them in a loop with
--   no row-level claim. The job runs every 5 minutes; if two invocations ever
--   overlap (a slow run, a manual trigger + cron), both SELECT the same rows and
--   both dispatch them → DUPLICATE notifications sent. (Contrast the fulfillment
--   worker, which already claims with FOR UPDATE SKIP LOCKED.)
--
-- FIX
--   A claim RPC that atomically leases a batch of due rows with
--   `FOR UPDATE SKIP LOCKED`, stamping a lease column (`claimed_at`) and leaving
--   `status` / `next_retry_at` intact so the worker's pure retryDecision() logic
--   is unchanged. The worker releases the lease (`claimed_at = null`) after each
--   attempt, so the real backoff in `next_retry_at` governs the next retry.
--
--   DOUBLE-SEND SAFETY (airtight): the stale-lease reclaim window is 15 minutes,
--   which MUST stay well above the notifications-retry route's maxDuration (60s).
--   A row claimed by run A only becomes re-claimable 15 min later, by which time
--   Vercel has long since killed run A (at 60s). So a still-alive run can never
--   have its un-reached tail stolen and re-dispatched by the next run — the exact
--   race an earlier 5-min window (== the 5-min cron cadence) allowed. If A reaches
--   a row while alive it transitions its status, removing it from the due set.
--
--   STRANDED-ROW RECOVERY: if a run dies after flipping a row to 'retrying' but
--   before the terminal write, the row would otherwise be stuck forever (the DLQ
--   only scans 'dead'). The claim also reclaims a 'retrying' row whose lease is
--   >15 min stale, resetting it to 'failed' so it re-enters the retry flow.
--
-- service_role-only (the worker calls it via createAdminClient). Forward-only.
-- ============================================================================

alter table public.notification_log
  add column if not exists claimed_at timestamptz;

-- Per-recipient delivery tracking for multi-recipient (email) dispatches. A partial failure records
-- the recipients that DID succeed here; a retry then re-sends only the still-failed ones, so an
-- already-delivered recipient is never re-sent unnecessarily. Default empty = single-recipient / none yet.
alter table public.notification_log
  add column if not exists delivered_recipients text[] not null default '{}';

create or replace function public.claim_due_notifications(p_limit integer)
returns setof public.notification_log
language sql
security definer
set search_path to 'public'
as $$
  update public.notification_log n
  -- Revive a row stranded in-flight: 'retrying' (crashed during a RETRY) or 'sending' (crashed during
  -- the INITIAL attempt, after openLog but before closeLog) → back to 'failed' so the worker re-dispatches.
  set status = case when n.status in ('retrying', 'sending') then 'failed' else n.status end,
      -- A revived 'sending' row has no next_retry_at yet → make it due now so retryDecision retries it.
      next_retry_at = case when n.status = 'sending' then now() else n.next_retry_at end,
      -- Count each revival as an attempt so a pathological crash-after-accept loop is BOUNDED: after
      -- maxAttempts revivals retryDecision() sends it to the DLQ instead of re-dispatching forever.
      attempts = case when n.status in ('retrying', 'sending') then coalesce(n.attempts, 1) + 1 else n.attempts end,
      claimed_at = now()
  where n.id in (
    select id
    from public.notification_log
    where (
      (status in ('failed', 'queued') and next_retry_at is not null and next_retry_at <= now()
         and (claimed_at is null or claimed_at < now() - interval '15 minutes'))
      or
      (status = 'retrying' and claimed_at is not null and claimed_at < now() - interval '15 minutes')
      or
      -- stranded INITIAL attempt: 'sending' with no claim lease, stuck past the window (last_attempt_at
      -- is stamped by openLog). The idempotency key makes re-dispatch safe (provider de-dups within 24h).
      (status = 'sending' and last_attempt_at is not null and last_attempt_at < now() - interval '15 minutes')
    )
    order by next_retry_at asc nulls last
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning n.*;
$$;

revoke all on function public.claim_due_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(integer) to service_role;
