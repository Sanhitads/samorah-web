import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runRetryWorker, runAutoReplay } from "@/lib/notifications/opsEngine";

/**
 * Auto-retry worker — re-attempts failed dispatches on the configured backoff (1m → 5m → 15m) and
 * retires exhausted ones to the Dead Letter Queue, so a transient Slack/Resend outage self-heals and
 * a permanent failure is never silently lost. Also drains rate-limited (queued) dispatches, and
 * auto-replays dead letters once a channel is demonstrably back. Runs every 5 min. CRON_SECRET.
 */
export const runtime = "nodejs";
// Bound the run well BELOW the claim's 15-min stale-lease window. Because a run is killed at 60s, its
// un-reached claimed rows only become re-claimable (15 min later) long after it is dead — so the next
// run can never re-dispatch the tail of a still-running batch (the double-send the claim prevents).
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const retry = await runRetryWorker();
    // A recovered channel should not need a human to drain its DLQ (scheduled replay).
    const replay = await runAutoReplay();
    // Surface degraded runs honestly. A claim failure is a HARD failure → 500 so Vercel logs a failed
    // cron invocation (alertable) rather than a healthy-looking empty run. Write errors are logged but
    // stay 200: the run did real work and the stale-lease reclaim reconciles the un-persisted rows.
    if (retry.writeErrors > 0) console.error("notifications-retry: completed with write errors", retry);
    return NextResponse.json({ ...retry, autoReplay: replay }, { status: retry.claimError ? 500 : 200 });
  } catch (e) {
    console.error("notifications-retry cron failed", e);
    return NextResponse.json({ error: "Retry worker failed." }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
