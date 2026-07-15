import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listSuppressionRules, createSuppressionRule, setSuppressionEnabled, deleteSuppressionRule,
  listMaintenanceWindows, createMaintenanceWindow, setMaintenanceEnabled, deleteMaintenanceWindow,
} from "@/services/incidentService";

/**
 * Suppression rules + maintenance windows (Phase 4). Operator-managed configuration that gates
 * incident creation. Staff-gated (editor+). Rows carry created_by + created_at; disabling is
 * preferred over deletion so the audit trail stays intact.
 */
export const runtime = "nodejs";

async function staffName(userId: string | null): Promise<string> {
  if (!userId) return "Staff";
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from("users").select("full_name").eq("id", userId).maybeSingle();
    return data?.full_name ?? "Staff";
  } catch { return "Staff"; }
}

export async function GET() {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const [suppressions, maintenance] = await Promise.all([listSuppressionRules(), listMaintenanceWindows()]);
  return NextResponse.json({ suppressions, maintenance });
}

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const actor = { id: staff.userId ?? null, name: await staffName(staff.userId) };

  let b: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { b = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const done = (r: { ok: boolean; error?: string }) => (r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? "Failed." }, { status: 400 }));

  switch (b.action) {
    case "suppression_create": return done(await createSuppressionRule(b, actor));
    case "suppression_toggle": return b.id != null && b.enabled != null ? done(await setSuppressionEnabled(b.id, b.enabled)) : NextResponse.json({ error: "id + enabled required." }, { status: 400 });
    case "suppression_delete": return b.id ? done(await deleteSuppressionRule(b.id)) : NextResponse.json({ error: "id required." }, { status: 400 });
    case "maintenance_create": return done(await createMaintenanceWindow(b, actor));
    case "maintenance_toggle": return b.id != null && b.enabled != null ? done(await setMaintenanceEnabled(b.id, b.enabled)) : NextResponse.json({ error: "id + enabled required." }, { status: 400 });
    case "maintenance_delete": return b.id ? done(await deleteMaintenanceWindow(b.id)) : NextResponse.json({ error: "id required." }, { status: 400 });
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
