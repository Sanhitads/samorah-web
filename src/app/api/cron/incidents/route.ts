import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { correlateIncidents, runEscalations, refreshActiveImpacts, runSlaChecks } from "@/services/incidentService";
import { notifyOps } from "@/lib/notifications/opsEngine";
import { withCronLock } from "@/lib/cronLock";

/**
 * Incident correlation cron. Runs the deterministic rule engine to open/merge incidents from
 * the current notification signals (incl. cross-system grouping + root-cause detection), then
 * runs the time-based escalation policy and refreshes business-impact snapshots. Guarded by
 * CRON_SECRET; scheduled every few minutes in vercel.json. Idempotent.
 *
 * correlateIncidents() is a SELECT-then-INSERT over all rules; two overlapping runs could open a
 * DUPLICATE incident for the same (category, rule). We SERIALIZE runs with a lease-based run-lock
 * (withCronLock) rather than a unique constraint — a constraint would wrongly absorb a legitimate
 * "new incident after a quiet period" (mergeWindowMinutes) into a stale one. maxDuration (120s) stays
 * below the lock TTL (240s) so a killed run's lease can't expire while it is still executing.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return await withCronLock<Response>("incidents", 240, async () => {
      const result = await correlateIncidents();
      const sla = await runSlaChecks();
      const escalation = await runEscalations();
      const impact = await refreshActiveImpacts();
      return NextResponse.json({ ...result, ...sla, ...escalation, ...impact });
    }, () => NextResponse.json({ skipped: "another incident-correlation run is in progress" }));
  } catch (e) {
    console.error("incident correlation cron failed", e);
    // A silently-dying cron is how incidents stop being detected at all — alert #tech.
    try {
      await notifyOps("cron.failed", {
        title: "Cron Failed — incident correlation",
        message: "The incident correlation cron threw. Detection is degraded until this is fixed.",
        fields: [{ label: "Cron", value: "/api/cron/incidents" }, { label: "Error", value: e instanceof Error ? e.message : "unknown" }],
        entityType: "cron", entityRef: "incidents",
      });
    } catch { /* alerting must never mask the original failure */ }
    return NextResponse.json({ error: "Correlation failed." }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
