-- ============================================================================
-- CONCURRENCY — a fenced, lease-based cron run-lock (mutex with owner token)
-- ============================================================================
-- Added during the deployment-hardening review (2026-10-16). A whole-pass worker
-- like incident correlation is serialized by SERIALIZING overlapping runs, not by
-- a data constraint (a unique index wrongly absorbed a legitimate post-quiet-period
-- new incident into a stale one, and could fail to apply on existing prod data).
--
-- DESIGN
--   • try_acquire_cron_lock(job, ttl) atomically grabs the lock IF it is free or its
--     lease has EXPIRED, stamps a fresh owner token + `now() + ttl`, and returns the
--     token (text). Returns NULL if another run holds a live lease. Single
--     INSERT … ON CONFLICT DO UPDATE … WHERE statement → atomic even under PgBouncer
--     transaction pooling (no session state).
--   • release_cron_lock(job, token) releases ONLY IF the caller's token still owns the
--     lock (FENCING). An expired run that resumes cannot release a NEWER run's lock —
--     the token no longer matches, so the release is a no-op. Returns true iff released.
--   • Leases use DATABASE time (now()), never application clocks.
--
-- SAFETY CONTRACT (both must hold, enforced by the calling routes):
--   • lease TTL  >  route maxDuration + margin  → a run Vercel kills mid-flight is
--     already dead long before its lease expires, so no two runs ever execute at once
--     (incidents: ttl 240s, maxDuration 120s → 120s margin). The fencing token is the
--     belt-and-suspenders for the release path even if that margin were ever violated.
--
-- service_role-only (crons call via createAdminClient); the lock table carries no
-- business data and is not exposed to anon/authenticated. Forward-only.
-- ============================================================================

create table if not exists public.cron_locks (
  job          text primary key,
  holder       text,                               -- fencing token of the current owner
  locked_until timestamptz not null default now()
);

alter table public.cron_locks enable row level security;  -- no policies → anon/authenticated see nothing via the Data API
-- Strip the inherited Supabase default table grants (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) from the
-- public API roles — no HTTP vector reaches them, but the lock table should expose nothing to them.
revoke all on table public.cron_locks from anon, authenticated;

create or replace function public.try_acquire_cron_lock(p_job text, p_ttl_seconds integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_candidate text := gen_random_uuid()::text;   -- DB-generated owner token
  v_result    text;
begin
  insert into public.cron_locks (job, holder, locked_until)
  values (p_job, v_candidate, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (job) do update
    set holder = excluded.holder, locked_until = excluded.locked_until
    where public.cron_locks.locked_until < now()   -- only steal an EXPIRED lease
  returning holder into v_result;
  return v_result;   -- the token if acquired, NULL if a live lease is held by someone else
end;
$$;

create or replace function public.release_cron_lock(p_job text, p_token text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  update public.cron_locks set locked_until = now()
  where job = p_job and holder = p_token   -- FENCING: only the current owner may release
  returning true;
$$;

revoke all on function public.try_acquire_cron_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_cron_lock(text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_cron_lock(text, integer) to service_role;
grant execute on function public.release_cron_lock(text, text) to service_role;
