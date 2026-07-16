import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOps } from "@/lib/notifications/opsEngine";

/**
 * Evening operations digest — 18:00 IST. Complements the 09:00 sales report: today's operational
 * picture (low stock, failed payments, open incidents, pending shipments) in one Slack post.
 * Real queries, no mocks. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const [variantsRes, failedPayRes, incidentsRes, pendingShipRes, ordersRes] = await Promise.all([
      db.from("variants").select("sku,stock,low_stock_threshold,is_active").eq("is_active", true),
      db.from("payment_attempts").select("id").eq("status", "failed").gte("created_at", startIso),
      db.from("incidents").select("number,severity").eq("is_simulation", false).in("status", ["open", "investigating", "mitigated"]),
      db.from("shipments").select("id").in("status", ["pending", "processing"]),
      db.from("orders").select("id,total_amount").gte("placed_at", startIso),
    ]);

    const lowStock = ((variantsRes.data ?? []) as any[]).filter((v) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const failedPayments = (failedPayRes.data ?? []).length;
    const incidents = (incidentsRes.data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const criticalIncidents = incidents.filter((i) => i.severity === "critical").length;
    const pendingShipments = (pendingShipRes.data ?? []).length;
    const orders = (ordersRes.data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const revenue = orders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);

    const anyTrouble = lowStock.length > 0 || failedPayments > 0 || incidents.length > 0;
    const result = await notifyOps("daily.sales_report", {
      title: `Evening Operations Summary — ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
      message: anyTrouble ? "Items below need attention before end of day." : "All clear — no outstanding operational issues.",
      severity: criticalIncidents > 0 ? "critical" : anyTrouble ? "warning" : "info",
      fields: [
        { label: "Orders today", value: String(orders.length) },
        { label: "Revenue today", value: `₹${Math.round(revenue).toLocaleString("en-IN")}` },
        { label: "Low stock SKUs", value: lowStock.length ? `${lowStock.length} (${lowStock.slice(0, 3).map((v) => v.sku).join(", ")}${lowStock.length > 3 ? "…" : ""})` : "0" },
        { label: "Failed payments", value: String(failedPayments) },
        { label: "Open incidents", value: incidents.length ? `${incidents.length}${criticalIncidents ? ` (${criticalIncidents} critical)` : ""}` : "0" },
        { label: "Pending shipments", value: String(pendingShipments) },
      ],
      entityType: "report", entityRef: "evening-digest",
    });
    return NextResponse.json({ ok: true, lowStock: lowStock.length, failedPayments, incidents: incidents.length, results: result.results });
  } catch (e) {
    console.error("evening digest failed", e);
    return NextResponse.json({ error: "digest failed" }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
