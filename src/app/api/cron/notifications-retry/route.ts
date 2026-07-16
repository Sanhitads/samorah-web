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

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const retry = await runRetryWorker();
  // A recovered channel should not need a human to drain its DLQ (scheduled replay).
  const replay = await runAutoReplay();
  return NextResponse.json({ ...retry, autoReplay: replay });
}

export const GET = POST; // Vercel Cron invokes via GET
