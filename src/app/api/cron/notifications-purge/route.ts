import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { purgeExpiredNotifications } from "@/lib/notifications/opsEngine";

/**
 * Retention purge — deletes notification_log rows past their retention date so the table cannot
 * grow indefinitely. Classes (src/config/notifications.ts): high 2 years · operational 180 days ·
 * debug/test 30 days. Nightly via vercel.json. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const r = await purgeExpiredNotifications();
  return NextResponse.json(r);
}

export const GET = POST; // Vercel Cron invokes via GET
