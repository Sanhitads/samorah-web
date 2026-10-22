import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Serialize a cron job across overlapping invocations using a lease-based DB run-lock
 * (try_acquire_cron_lock / release_cron_lock, service_role-only).
 *
 * Acquires the lock for `job` with a `ttlSeconds` lease. If another run already holds it, runs
 * `onBusy()` instead of the work (so a second concurrent invocation is a no-op, not a duplicate run).
 * The lock is ALWAYS released when the work settles (success or throw), so a normally-finishing run
 * frees it immediately; a run that Vercel kills mid-flight simply lets its lease expire after TTL.
 *
 * CONTRACT: the calling route MUST set `maxDuration` BELOW `ttlSeconds`, so a killed run cannot still
 * be executing at the moment its lease expires and a new run acquires the lock — which is what makes
 * "no two runs execute concurrently" airtight.
 */
export async function withCronLock<T>(
  job: string,
  ttlSeconds: number,
  work: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  const db = createAdminClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  // Acquire returns a fencing TOKEN (the owner id) or null if another run holds a live lease.
  const { data: token, error } = await db.rpc("try_acquire_cron_lock", { p_job: job, p_ttl_seconds: ttlSeconds });
  if (error) throw new Error(`cron lock acquire failed for "${job}": ${error.message}`);
  if (!token) return onBusy();
  try {
    return await work();
  } finally {
    // Release passes our token; release_cron_lock is a no-op if a newer run already owns the lock.
    try { await db.rpc("release_cron_lock", { p_job: job, p_token: token }); } catch { /* lease expires on its own */ }
  }
}
