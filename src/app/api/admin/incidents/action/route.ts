import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignIncident, setIncidentStatus, addIncidentNote, correlateIncidents } from "@/services/incidentService";

/**
 * POST /api/admin/incidents/action — staff actions on incidents (assign / status / note) and a
 * manual "run correlation" trigger. Staff-gated (editor+). Statuses are independent of the
 * underlying notifications.
 */
export const runtime = "nodejs";

const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

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

  let body: { action?: string; number?: string; status?: string; note?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (body.action === "correlate") {
    const result = await correlateIncidents();
    return NextResponse.json({ ok: true, result });
  }

  if (!body.number) return NextResponse.json({ error: "number is required." }, { status: 400 });
  const actor = { id: staff.userId ?? null, name: await staffName(staff.userId) };

  if (body.action === "assign") {
    const r = await assignIncident(body.number, actor);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed." }, { status: 500 });
  }
  if (body.action === "status") {
    if (!body.status || !STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    const r = await setIncidentStatus(body.number, body.status, actor);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed." }, { status: 500 });
  }
  if (body.action === "note") {
    if (!body.note) return NextResponse.json({ error: "note is required." }, { status: 400 });
    const r = await addIncidentNote(body.number, body.note, actor);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
