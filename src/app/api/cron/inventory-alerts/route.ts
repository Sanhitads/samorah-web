import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOps } from "@/lib/notifications/opsEngine";

/**
 * Low-stock alerting — every 30 min. Emits `inventory.low_stock` per SKU at/below its threshold.
 *
 * Low stock is a STANDING condition (it stays true until someone restocks), so a naive alert would
 * re-post every tick. Dedup handles this: `inventory.low_stock` has a 12-hour window override
 * (config `DEDUP.windowOverrides`), so a given SKU alerts once per 12h and the repeats are counted
 * on the leader instead of flooding #warehouse. Out-of-stock (0) escalates to critical.
 *
 * Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from("variants").select("sku,stock,low_stock_threshold,is_active,product_id").eq("is_active", true);
    const low = ((data ?? []) as any[]).filter((v) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0)); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!low.length) return NextResponse.json({ ok: true, lowStock: 0, alerted: 0 });

    const base = process.env.NEXT_PUBLIC_SITE_URL || "";
    let alerted = 0, suppressed = 0;
    for (const v of low) {
      const out = Number(v.stock) <= 0;
      const r = await notifyOps("inventory.low_stock", {
        title: out ? "Out of Stock" : "Stock Running Low",
        severity: out ? "critical" : "warning",   // 0 units can oversell → critical
        fields: [
          { label: "SKU", value: v.sku },
          { label: "Remaining", value: `${v.stock} units` },
          { label: "Threshold", value: `${v.low_stock_threshold} units` },
          { label: "Supplier ETA", value: "Unknown" },
        ],
        url: base ? `${base}/admin/products` : undefined,
        entityType: "inventory", entityRef: v.sku,
      });
      if (r.suppressed) suppressed++; else alerted++;
    }
    return NextResponse.json({ ok: true, lowStock: low.length, alerted, suppressed });
  } catch (e) {
    console.error("inventory alerts failed", e);
    return NextResponse.json({ error: "inventory alerts failed" }, { status: 500 });
  }
}

export const GET = POST; // Vercel Cron invokes via GET
