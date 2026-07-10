/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reports (Phase 4) — the business/filing reports the founder + accountant need,
 * complementing the operational /admin/analytics: a GST report (CGST/SGST/IGST by
 * state, for filing), top products by revenue, coupon usage, repeat-customer rate,
 * and orders-by-state. All derived from paid orders in a window.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const PAID = ["paid", "partially_refunded", "refunded"];
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface GstByState { state: string; orders: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }
export interface Reports {
  windowDays: number | null;
  gst: { taxable: number; cgst: number; sgst: number; igst: number; total: number; byState: GstByState[] };
  topProducts: { name: string; units: number; revenue: number }[];
  coupons: { code: string; redemptions: number; discountGiven: number }[];
  customers: { total: number; returning: number; newCustomers: number; repeatRate: number };
  ordersByState: { state: string; orders: number; revenue: number }[];
}

export async function getReports(windowDays: number | null = 30): Promise<Reports> {
  const db = createAdminClient() as any;
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;

  let oq = db.from("orders").select("id,email,user_id,ship_state,coupon_code,total_amount,discount_amount,taxable_amount,cgst_amount,sgst_amount,igst_amount,placed_at,order_items(product_name,quantity,line_total)").in("payment_status", PAID);
  if (cutoff) oq = oq.gte("placed_at", cutoff);
  const { data } = await oq;
  const orders = (data ?? []) as any[];

  // GST totals + by state
  const gst = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, byState: [] as GstByState[] };
  const stateMap = new Map<string, GstByState>();
  const revByState = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const st = o.ship_state || "—";
    gst.taxable += Number(o.taxable_amount ?? 0); gst.cgst += Number(o.cgst_amount ?? 0);
    gst.sgst += Number(o.sgst_amount ?? 0); gst.igst += Number(o.igst_amount ?? 0); gst.total += Number(o.total_amount ?? 0);
    const s = stateMap.get(st) ?? { state: st, orders: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    s.orders++; s.taxable += Number(o.taxable_amount ?? 0); s.cgst += Number(o.cgst_amount ?? 0);
    s.sgst += Number(o.sgst_amount ?? 0); s.igst += Number(o.igst_amount ?? 0); s.total += Number(o.total_amount ?? 0);
    stateMap.set(st, s);
    const rv = revByState.get(st) ?? { orders: 0, revenue: 0 };
    rv.orders++; rv.revenue += Number(o.total_amount ?? 0); revByState.set(st, rv);
  }
  gst.taxable = r1(gst.taxable); gst.cgst = r1(gst.cgst); gst.sgst = r1(gst.sgst); gst.igst = r1(gst.igst); gst.total = r1(gst.total);
  gst.byState = [...stateMap.values()].map((s) => ({ ...s, taxable: r1(s.taxable), cgst: r1(s.cgst), sgst: r1(s.sgst), igst: r1(s.igst), total: r1(s.total) })).sort((a, b) => b.total - a.total);

  // Top products (units + revenue)
  const prod = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) for (const it of o.order_items ?? []) {
    const p = prod.get(it.product_name) ?? { units: 0, revenue: 0 };
    p.units += Number(it.quantity ?? 0); p.revenue += Number(it.line_total ?? 0); prod.set(it.product_name, p);
  }
  const topProducts = [...prod.entries()].map(([name, v]) => ({ name, units: v.units, revenue: r1(v.revenue) })).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

  // Coupon usage
  const coup = new Map<string, { redemptions: number; discountGiven: number }>();
  for (const o of orders) {
    if (!o.coupon_code) continue;
    const c = coup.get(o.coupon_code) ?? { redemptions: 0, discountGiven: 0 };
    c.redemptions++; c.discountGiven += Number(o.discount_amount ?? 0); coup.set(o.coupon_code, c);
  }
  const coupons = [...coup.entries()].map(([code, v]) => ({ code, redemptions: v.redemptions, discountGiven: r1(v.discountGiven) })).sort((a, b) => b.redemptions - a.redemptions);

  // Repeat-customer rate (by email/user)
  const byCustomer = new Map<string, number>();
  for (const o of orders) { const k = o.user_id || o.email; if (k) byCustomer.set(k, (byCustomer.get(k) ?? 0) + 1); }
  const total = byCustomer.size;
  const returning = [...byCustomer.values()].filter((n) => n >= 2).length;
  const customers = { total, returning, newCustomers: total - returning, repeatRate: total ? r1((returning / total) * 100) : 0 };

  const ordersByState = [...revByState.entries()].map(([state, v]) => ({ state, orders: v.orders, revenue: r1(v.revenue) })).sort((a, b) => b.revenue - a.revenue);

  return { windowDays, gst, topProducts, coupons, customers, ordersByState };
}
