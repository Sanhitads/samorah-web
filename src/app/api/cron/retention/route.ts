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

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = { loginHistoryPurged: 0, auditPurged: 0 };
  try {
    const loginCutoff = new Date(Date.now() - LOGIN_HISTORY_DAYS * 86400000).toISOString();
    const auditCutoff = new Date(Date.now() - AUDIT_LOG_DAYS * 86400000).toISOString();
    const lh = await db.from("login_history").delete({ count: "exact" }).lt("created_at", loginCutoff);
    const al = await db.from("account_audit_log").delete({ count: "exact" }).lt("created_at", auditCutoff);
    result.loginHistoryPurged = lh.count ?? 0;
    result.auditPurged = al.count ?? 0;
    return NextResponse.json(result);
  } catch (e) {
    console.error("retention cron failed", e);
    return NextResponse.json({ error: "Retention run failed." }, { status: 500 });
  }
}

// Vercel Cron invokes via GET; accept it (still guarded by CRON_SECRET).
export const GET = POST;
