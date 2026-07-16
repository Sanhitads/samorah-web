import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryDispatch, markRead, markAllRead, acknowledgeCritical, getUnreadCount } from "@/lib/notifications/opsEngine";

/**
 * Operations Center actions — retry a failed dispatch, mark read / mark all read, acknowledge a
 * critical alert. GET returns the unread + unacknowledged-critical counts (bell badge). Staff-gated.
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
  return NextResponse.json(await getUnreadCount());
}

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let b: { action?: string; id?: string; groupId?: string } = {};
  try { b = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  switch (b.action) {
    case "retry": {
      if (!b.id) return NextResponse.json({ error: "id required." }, { status: 400 });
      const r = await retryDispatch(b.id, await staffName(staff.userId));
      return r.ok ? NextResponse.json({ ok: true, status: r.status }) : NextResponse.json({ error: r.error ?? "Retry failed.", status: r.status }, { status: 400 });
    }
    case "read": return b.groupId ? NextResponse.json(await markRead(b.groupId)) : NextResponse.json({ error: "groupId required." }, { status: 400 });
    case "read_all": return NextResponse.json(await markAllRead());
    case "acknowledge": return b.groupId ? NextResponse.json(await acknowledgeCritical(b.groupId, await staffName(staff.userId))) : NextResponse.json({ error: "groupId required." }, { status: 400 });
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
