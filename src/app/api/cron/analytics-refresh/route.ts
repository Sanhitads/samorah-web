import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAnalyticsOps } from "@/lib/analytics/opsLog";

/**
 * Analytics materialized-view refresh — every 15 min. Calls `analytics_refresh_mvs()` which does a
 * non-blocking `REFRESH MATERIALIZED VIEW CONCURRENTLY` of the analytics MVs (currently the daily order
 * metrics that power the Stage-4 trend charts). Replaces the previous manual refresh so production
 * freshness is automated. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = createAdminClient() as unknown as { rpc(fn: "analytics_refresh_mvs", args?: Record<string, never>): Promise<{ error: { message: string } | null }> };
    const { error } = await db.rpc("analytics_refresh_mvs");
    if (error) {
      logAnalyticsOps("rpc.failed", { rpc: "analytics_refresh_mvs", message: error.message });
      return NextResponse.json({ error: "refresh failed" }, { status: 500 });
    }
    logAnalyticsOps("dashboard.refresh", { target: "analytics_mvs" });
    return NextResponse.json({ ok: true, refreshed: ["analytics_mv_daily_order_metrics"] });
  } catch (e) {
    logAnalyticsOps("rpc.failed", { rpc: "analytics_refresh_mvs", message: String(e) });
    return NextResponse.json({ error: "analytics refresh failed" }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
