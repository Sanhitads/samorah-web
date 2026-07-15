import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignIncident, removeAssignment, watchIncident, unwatchIncident, setIncidentTeam, setIncidentStatus,
  setIncidentSeverity, addIncidentNote, toggleChecklistItem, snoozeIncident, correlateIncidents,
} from "@/services/incidentService";

/**
 * POST /api/admin/incidents/action — all incident collaboration actions (Phase 2) + the manual
 * correlation trigger. Staff-gated (editor+). Every action lands in the append-only incident
 * history, so the full trail is auditable (nothing is destructively removed without a record).
 */
export const runtime = "nodejs";

const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];
const SEVERITIES = ["critical", "high", "medium", "low", "info"];

async function staffName(userId: string | null): Promise<string> {
  if (!userId) return "Staff";
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => { select: (q: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { full_name?: string | null } | null }> } } } };
    const { data } = await db.from("users").select("full_name").eq("id", userId).maybeSingle();
    return data?.full_name ?? "Staff";
  } catch { return "Staff"; }
}

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let b: { action?: string; number?: string; status?: string; severity?: string; note?: string; team?: string; role?: string; itemId?: string; done?: boolean; minutes?: number; targetId?: string; targetName?: string; userId?: string };
  try { b = (await request.json()) as typeof b; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (b.action === "correlate") return NextResponse.json({ ok: true, result: await correlateIncidents() });

  const actor = { id: staff.userId ?? null, name: await staffName(staff.userId) };
  const num = b.number;
  const ok = (r: { ok: boolean }) => (r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed." }, { status: 500 }));

  switch (b.action) {
    case "assign": {
      if (!num) return NextResponse.json({ error: "number required." }, { status: 400 });
      const target = b.targetId ? { id: b.targetId, name: b.targetName ?? "Staff" } : actor;
      return ok(await assignIncident(num, target, actor));
    }
    case "unassign": return num ? ok(await removeAssignment(num, actor)) : NextResponse.json({ error: "number required." }, { status: 400 });
    case "watch": return num ? ok(await watchIncident(num, actor, b.role === "follower" ? "follower" : "watcher", actor)) : NextResponse.json({ error: "number required." }, { status: 400 });
    case "unwatch": return num ? ok(await unwatchIncident(num, b.userId ?? actor.id, actor)) : NextResponse.json({ error: "number required." }, { status: 400 });
    case "team": return num && b.team ? ok(await setIncidentTeam(num, b.team, actor)) : NextResponse.json({ error: "number + team required." }, { status: 400 });
    case "status": return num && b.status && STATUSES.includes(b.status) ? ok(await setIncidentStatus(num, b.status, actor)) : NextResponse.json({ error: "valid status required." }, { status: 400 });
    case "severity": return num && b.severity && SEVERITIES.includes(b.severity) ? ok(await setIncidentSeverity(num, b.severity, actor)) : NextResponse.json({ error: "valid severity required." }, { status: 400 });
    case "note": return num && b.note ? ok(await addIncidentNote(num, b.note, actor)) : NextResponse.json({ error: "number + note required." }, { status: 400 });
    case "checklist": return b.itemId != null && b.done != null ? ok(await toggleChecklistItem(b.itemId, b.done, actor)) : NextResponse.json({ error: "itemId + done required." }, { status: 400 });
    case "snooze": return num && b.minutes != null ? ok(await snoozeIncident(num, b.minutes, actor)) : NextResponse.json({ error: "number + minutes required." }, { status: 400 });
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
