import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOps } from "@/lib/notifications/opsEngine";

/**
 * Daily sales report — every morning (09:00 IST via vercel.json). Summarises YESTERDAY (IST) and
 * posts to Slack #samorah-ops + email. Deterministic query, no mocks. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    // Yesterday in IST → UTC window.
    const IST = 330 * 60000;
    const nowIstMidnight = new Date(Math.floor((Date.now() + IST) / 86400000) * 86400000 - IST); // today 00:00 IST as UTC
    const startUtc = new Date(nowIstMidnight.getTime() - 86400000).toISOString();
    const endUtc = nowIstMidnight.toISOString();

    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from("orders").select("total_amount,status,placed_at,created_at").gte("placed_at", startUtc).lt("placed_at", endUtc);
    const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const revenue = rows.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const cancelled = rows.filter((o) => o.status === "cancelled").length;
    const pending = rows.filter((o) => ["pending", "processing", "confirmed"].includes(o.status)).length;
    const count = rows.length;
    const aov = count ? revenue / count : 0;
    const dateLabel = new Date(startUtc).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    const result = await notifyOps("daily.sales_report", {
      title: `Daily Sales Report — ${dateLabel}`,
      message: `Yesterday's performance summary.`,
      fields: [
        { label: "Orders", value: String(count) },
        { label: "Revenue", value: inr(revenue) },
        { label: "Pending Orders", value: String(pending) },
        { label: "Cancelled", value: String(cancelled) },
        { label: "Average Order Value", value: inr(aov) },
      ],
      entityType: "report", entityRef: dateLabel,
    });
    return NextResponse.json({ ok: true, count, revenue, results: result.results });
  } catch (e) {
    console.error("daily sales report failed", e);
    return NextResponse.json({ error: "report failed" }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
