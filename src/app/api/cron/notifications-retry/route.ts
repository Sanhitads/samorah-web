import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runRetryWorker } from "@/lib/notifications/opsEngine";

/**
 * Auto-retry worker — re-attempts failed dispatches on the configured backoff (1m → 5m → 15m) and
 * retires exhausted ones to the Dead Letter Queue, so a transient Slack/Resend outage self-heals and
 * a permanent failure is never silently lost. Runs every 5 min. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await runRetryWorker());
}

export const GET = POST; // Vercel Cron invokes via GET
