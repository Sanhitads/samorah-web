import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { correlateIncidents, runEscalations, refreshActiveImpacts, runSlaChecks } from "@/services/incidentService";
import { notifyOps } from "@/lib/notifications/opsEngine";

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
    const sla = await runSlaChecks();
    const escalation = await runEscalations();
    const impact = await refreshActiveImpacts();
    return NextResponse.json({ ...result, ...sla, ...escalation, ...impact });
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
