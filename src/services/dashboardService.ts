/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Business dashboard (Phase 2, Point 1) — the numbers a founder checks first thing:
 * today's revenue/orders/AOV, top product, low-stock variants, pending emails and
 * failed payments. Distinct from the operational metrics (pick/pack times). All
 * derived; head+exact counts where possible.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const PAID = ["paid", "partially_refunded", "refunded"];

export interface BusinessDashboard {
  todayRevenue: number;
  todayOrders: number;
  aov: number; // last-30d average order value (stable)
  topProduct: { name: string; units: number } | null;
  lowStockVariants: number;
  pendingEmails: number;
  failedPayments: number;
}

export async function getBusinessDashboard(): Promise<BusinessDashboard> {
  const db = createAdminClient() as any;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [todayOrdersRes, monthOrdersRes, lowStockRes, pendingRes, failedRes, topRes] = await Promise.all([
    // Today's paid orders (revenue computed from returned rows)
    db.from("orders").select("total_amount").in("payment_status", PAID).gte("placed_at", todayIso),
    // 30-day paid orders for AOV
    db.from("orders").select("total_amount").in("payment_status", PAID).gte("placed_at", monthAgo),
    // Low-stock active variants (stock at/below threshold)
    db.from("variants").select("stock,low_stock_threshold,is_active").eq("is_active", true),
    // Pending emails = queued notification jobs
    db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).in("job_type", ["email", "dispatch_email", "cancellation_email"]).eq("status", "queued"),
    // Failed payments (last 30d)
    db.from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", monthAgo),
    // Top product by units (last 30d) — join order_items to paid orders
    db.from("order_items").select("product_name,quantity,orders!inner(payment_status,placed_at)").gte("orders.placed_at", monthAgo).in("orders.payment_status", PAID).limit(2000),
  ]);

  const todayOrders = (todayOrdersRes.data ?? []) as { total_amount: number }[];
  const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);

  const monthOrders = (monthOrdersRes.data ?? []) as { total_amount: number }[];
  const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const aov = monthOrders.length ? Math.round(monthRevenue / monthOrders.length) : 0;

  const lowStock = ((lowStockRes.data ?? []) as { stock: number; low_stock_threshold: number }[]).filter(
    (v) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0),
  ).length;

  // Top product
  const units = new Map<string, number>();
  for (const it of (topRes.data ?? []) as { product_name: string; quantity: number }[]) {
    units.set(it.product_name, (units.get(it.product_name) ?? 0) + Number(it.quantity ?? 0));
  }
  let topProduct: { name: string; units: number } | null = null;
  for (const [name, u] of units) if (!topProduct || u > topProduct.units) topProduct = { name, units: u };

  return {
    todayRevenue: Math.round(todayRevenue),
    todayOrders: todayOrders.length,
    aov,
    topProduct,
    lowStockVariants: lowStock,
    pendingEmails: (pendingRes as { count: number | null }).count ?? 0,
    failedPayments: (failedRes as { count: number | null }).count ?? 0,
  };
}
