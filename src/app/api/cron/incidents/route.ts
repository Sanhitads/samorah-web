import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { correlateIncidents, runEscalations, refreshActiveImpacts } from "@/services/incidentService";

/**
 * Incident correlation cron. Runs the deterministic rule engine to open/merge incidents from
 * the current notification signals (incl. cross-system grouping + root-cause detection), then
 * runs the time-based escalation policy and refreshes business-impact snapshots. Guarded by
 * CRON_SECRET; scheduled every few minutes in vercel.json. Idempotent.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await correlateIncidents();
    const escalation = await runEscalations();
    const impact = await refreshActiveImpacts();
    return NextResponse.json({ ...result, ...escalation, ...impact });
  } catch (e) {
    console.error("incident correlation cron failed", e);
    return NextResponse.json({ error: "Correlation failed." }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
