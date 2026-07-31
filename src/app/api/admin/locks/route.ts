import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { acquireLock, releaseLock } from "@/services/cmsLockService";

/** POST /api/admin/locks { action, resource } — advisory content locks (heartbeat). editor+. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.resource) return NextResponse.json({ error: "resource required" }, { status: 400 });

  if (body.action === "release") { await releaseLock(body.resource, staff.userId ?? undefined); return NextResponse.json({ ok: true }); }
  // "steal" = the Take-over-editing action: forcibly reassign the lock to the caller (point 34).
  return NextResponse.json(await acquireLock(body.resource, staff.userId ?? undefined, { steal: body.action === "steal" }));
}
