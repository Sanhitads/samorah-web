import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { markNotificationRead, markAllNotificationsRead } from "@/services/notificationCenterService";

/** POST /api/admin/notifications { action: "read"|"read-all", id? } — dismiss event notifications. editor+. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (body.action === "read") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json(await markNotificationRead(body.id));
  }
  if (body.action === "read-all") return NextResponse.json(await markAllNotificationsRead());
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
