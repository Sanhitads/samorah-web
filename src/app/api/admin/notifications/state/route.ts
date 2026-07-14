import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { setNotificationState, type NotificationState } from "@/services/notificationCenterService";

/**
 * POST /api/admin/notifications/state — acknowledge / claim / update an operational alert
 * item (review points 5, 8). Assigns the acting staff member unless the state is reset to
 * open. Staff-gated (editor+).
 */
export const runtime = "nodejs";

const STATES: NotificationState[] = ["open", "acknowledged", "in_progress", "resolved"];

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { alertKey?: string; alertKeys?: string[]; state?: string; note?: string; snoozeMinutes?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const keys = body.alertKeys?.length ? body.alertKeys : body.alertKey ? [body.alertKey] : [];
  if (!keys.length || !body.state || !STATES.includes(body.state as NotificationState)) {
    return NextResponse.json({ error: "alertKey(s) and a valid state are required." }, { status: 400 });
  }

  const claiming = body.state !== "open";
  let name: string | null = null;
  if (claiming && staff.userId) {
    try {
      const db = createAdminClient() as unknown as { from: (t: string) => { select: (q: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { full_name?: string | null } | null }> } } } };
      const { data } = await db.from("users").select("full_name").eq("id", staff.userId).maybeSingle();
      name = data?.full_name ?? "Staff";
    } catch { name = "Staff"; }
  }
  const snoozedUntil = body.snoozeMinutes && body.snoozeMinutes > 0 ? new Date(Date.now() + body.snoozeMinutes * 60000).toISOString() : null;
  const res = await setNotificationState({
    alertKeys: keys,
    state: body.state as NotificationState,
    assigneeId: claiming ? staff.userId ?? null : null,
    assigneeName: name,
    note: body.note,
    updatedBy: staff.userId ?? null,
    snoozedUntil,
  });
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.reason ?? "Failed." }, { status: 500 });
}
