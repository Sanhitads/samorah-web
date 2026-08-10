/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Business overview (review point 11) — "what a CEO wants to see" in one place, all derived
 * first-party from orders/order_items/variants: today's & monthly orders/revenue, order-status
 * mix, payment mix (COD vs prepaid), returning/repeat customers, inventory alerts (out-of-stock
 * / low stock), average basket, and best/worst sellers. No GA4 needed — this is our own data.
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeFreshness, type DataFreshness } from "@/lib/analytics/dataFreshness";
import { analyticsRpc } from "@/lib/analytics/rpc";
import { cacheMs, cacheSeconds } from "@/lib/analytics/cacheConfig";

const db = () => createAdminClient() as any;
const PAID = ["paid", "partially_refunded", "refunded"];
const r0 = (n: number) => Math.round(n);
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export interface BusinessOverview {
  today: { orders: number; revenue: number };
  window: { days: number | null; orders: number; revenue: number; avgBasket: number; pending: number; cancelled: number; refunded: number };
  payment: { codShare: number; prepaidShare: number; codOrders: number; prepaidOrders: number };
  customers: { total: number; returningRate: number; repeatRate: number };
  inventory: { outOfStock: number; lowStock: number };
  bestSellers: { name: string; units: number; revenue: number }[];
  worstSellers: { name: string; units: number; revenue: number }[];
}

export async function getBusinessOverview(windowDays: number | null = 30): Promise<BusinessOverview> {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;

  const ordersQ = db().from("orders").select("status,payment_status,is_cod,total_amount,placed_at");
  const itemsQ = db().from("order_items").select("product_name,quantity,line_total,orders!inner(payment_status,placed_at)").in("orders.payment_status", PAID).limit(10000);

  const [ordersRes, itemsRes, variantsRes, productsRes, custRes] = await Promise.all([
    cutoff ? ordersQ.gte("placed_at", cutoff) : ordersQ,
    cutoff ? itemsQ.gte("orders.placed_at", cutoff) : itemsQ,
    db().from("variants").select("stock,low_stock_threshold").eq("is_active", true),
    db().from("products").select("name").eq("status", "active"),
    db().from("orders").select("user_id,email").in("payment_status", PAID),
  ]);

  const orders = (ordersRes.data ?? []) as any[];
  const paid = orders.filter((o) => PAID.includes(o.payment_status));
  const revenue = paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const todayPaid = paid.filter((o) => new Date(o.placed_at) >= startToday);
  const codOrders = paid.filter((o) => o.is_cod).length;
  const prepaidOrders = paid.length - codOrders;

  // Inventory alerts
  const variants = (variantsRes.data ?? []) as any[];
  const outOfStock = variants.filter((v) => Number(v.stock ?? 0) <= 0).length;
  const lowStock = variants.filter((v) => { const s = Number(v.stock ?? 0); return s > 0 && s <= Number(v.low_stock_threshold ?? 0); }).length;

  // Returning / repeat customers (lifetime)
  const byCust = new Map<string, number>();
  for (const o of (custRes.data ?? []) as any[]) { const k = o.user_id || o.email; if (k) byCust.set(k, (byCust.get(k) ?? 0) + 1); }
  const totalCust = byCust.size;
  const repeatCust = [...byCust.values()].filter((n) => n >= 2).length;

  // Best / worst sellers — units per product (0 for products with no sales in window)
  const sold = new Map<string, { units: number; revenue: number }>();
  for (const p of (productsRes.data ?? []) as any[]) sold.set(p.name, { units: 0, revenue: 0 });
  for (const it of (itemsRes.data ?? []) as any[]) {
    const cur = sold.get(it.product_name) ?? { units: 0, revenue: 0 };
    cur.units += Number(it.quantity ?? 0); cur.revenue += Number(it.line_total ?? 0);
    sold.set(it.product_name, cur);
  }
  const ranked = [...sold.entries()].map(([name, v]) => ({ name, units: v.units, revenue: r0(v.revenue) }));
  const bestSellers = [...ranked].sort((a, b) => b.units - a.units).slice(0, 5);
  const worstSellers = [...ranked].sort((a, b) => a.units - b.units).slice(0, 5);

  return {
    today: { orders: todayPaid.length, revenue: r0(todayPaid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0)) },
    window: {
      days: windowDays,
      orders: paid.length,
      revenue: r0(revenue),
      avgBasket: paid.length ? r0(revenue / paid.length) : 0,
      pending: orders.filter((o) => ["confirmed", "processing", "packed"].includes(o.status)).length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      refunded: orders.filter((o) => o.payment_status === "refunded" || o.payment_status === "partially_refunded").length,
    },
    payment: { codShare: share(codOrders, paid.length), prepaidShare: share(prepaidOrders, paid.length), codOrders, prepaidOrders },
    customers: { total: totalCust, returningRate: share(repeatCust, totalCust), repeatRate: share(repeatCust, totalCust) },
    inventory: { outOfStock, lowStock },
    bestSellers,
    worstSellers,
  };
}

// ── Stage 1 (Foundation) — optimized KPI snapshot ───────────────────────────────
// Server-side SQL aggregation via the `analytics_kpi_snapshot` RPC: current window + previous window
// (for % change) + today vs yesterday, in ONE query that scans only the last two windows. Replaces the
// JS-side row-fetch-and-reduce path for the KPI grid. Cached (60s) and carries data-freshness. This does
// NOT change getBusinessOverview (kept intact for the existing pages); it is an additive optimized reader.
export interface KpiPoint {
  current: number;
  /** comparable previous-period value, or null when a comparison isn't meaningful (e.g. all-time). */
  previous: number | null;
}
export interface KpiSnapshot {
  windowDays: number | null;
  revenue: KpiPoint; // window vs previous equal window
  orders: KpiPoint;
  avgBasket: KpiPoint;
  revenueToday: KpiPoint; // today vs yesterday
  ordersToday: KpiPoint;
  freshness: DataFreshness;
}

const nz = (v: string | number | null | undefined) => Math.round(Number(v ?? 0));

async function computeKpiSnapshot(windowDays: number | null): Promise<KpiSnapshot> {
  const { data, error } = await analyticsRpc().rpc("analytics_kpi_snapshot_v1", { p_window_days: windowDays ?? 3650 });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  const allTime = windowDays == null;
  const curOrders = nz(row?.cur_orders), curRev = nz(row?.cur_revenue);
  const prevOrders = nz(row?.prev_orders), prevRev = nz(row?.prev_revenue);
  const aovCur = curOrders ? Math.round(curRev / curOrders) : 0;
  const aovPrev = prevOrders ? Math.round(prevRev / prevOrders) : null;
  return {
    windowDays,
    revenue: { current: curRev, previous: allTime ? null : prevRev },
    orders: { current: curOrders, previous: allTime ? null : prevOrders },
    avgBasket: { current: aovCur, previous: allTime ? null : aovPrev },
    revenueToday: { current: nz(row?.today_revenue), previous: nz(row?.yday_revenue) },
    ordersToday: { current: nz(row?.today_orders), previous: nz(row?.yday_orders) },
    freshness: makeFreshness("orders", { fetchedAtMs: Date.now(), ttlMs: cacheMs("kpi"), available: true }),
  };
}

/** Optimized current+previous KPI snapshot (RPC-backed, cached). Reused by the Executive Summary grid. */
export async function getKpiSnapshot(windowDays: number | null = 30): Promise<KpiSnapshot> {
  return unstable_cache(
    () => computeKpiSnapshot(windowDays),
    ["analytics-kpi-snapshot", String(windowDays ?? "all")],
    { revalidate: cacheSeconds("kpi"), tags: ["analytics-kpi"] },
  )();
}

/** Daily revenue for the last N days (MV-backed) — a mini-sparkline series for the Revenue KPI card. */
export async function getRevenueSparkline(days = 14): Promise<number[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await analyticsRpc().rpc("analytics_daily_series_v1", { p_window_days: days });
      if (error || !data) return [];
      return data.map((r) => Math.round(Number(r.revenue ?? 0)));
    },
    ["analytics-revenue-spark", String(days)],
    { revalidate: cacheSeconds("dailySeries"), tags: ["analytics-kpi"] },
  )();
}
