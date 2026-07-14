import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data retention (review points 1 + 10). Purges login_history older than 180 days and
 * account_audit_log older than 730 days, keeping the tables small + indexes efficient
 * and honouring documented retention windows (see docs/AUTH_PRIVACY.md). Guarded by
 * CRON_SECRET; scheduled daily in vercel.json.
 */
export const runtime = "nodejs";

const LOGIN_HISTORY_DAYS = 180;
const AUDIT_LOG_DAYS = 730;
const NOTIFICATION_DAYS = 90;   // review point 15 — keep resolved notifications 90 days

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = { loginHistoryPurged: 0, auditPurged: 0, notificationsPurged: 0, notificationStatePurged: 0 };
  try {
    const loginCutoff = new Date(Date.now() - LOGIN_HISTORY_DAYS * 86400000).toISOString();
    const auditCutoff = new Date(Date.now() - AUDIT_LOG_DAYS * 86400000).toISOString();
    const notifCutoff = new Date(Date.now() - NOTIFICATION_DAYS * 86400000).toISOString();
    const lh = await db.from("login_history").delete({ count: "exact" }).lt("created_at", loginCutoff);
    const al = await db.from("account_audit_log").delete({ count: "exact" }).lt("created_at", auditCutoff);
    // Read event notifications older than the retention window (unread ones are kept as a to-do).
    const an = await db.from("admin_notifications").delete({ count: "exact" }).not("read_at", "is", null).lt("created_at", notifCutoff);
    // Stale workflow state whose alert has long since resolved.
    const ns = await db.from("notification_state").delete({ count: "exact" }).lt("updated_at", notifCutoff);
    result.loginHistoryPurged = lh.count ?? 0;
    result.auditPurged = al.count ?? 0;
    result.notificationsPurged = an.count ?? 0;
    result.notificationStatePurged = ns.count ?? 0;
    return NextResponse.json(result);
  } catch (e) {
    console.error("retention cron failed", e);
    return NextResponse.json({ error: "Retention run failed." }, { status: 500 });
  }
}

// Vercel Cron invokes via GET; accept it (still guarded by CRON_SECRET).
export const GET = POST;
