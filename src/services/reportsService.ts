/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reports (Phase 4) — the business/filing reports the founder + accountant need,
 * complementing the operational /admin/analytics: a GST report (CGST/SGST/IGST by
 * state, for filing), top products by revenue, coupon usage, repeat-customer rate,
 * and orders-by-state. All derived from paid orders in a window.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteSettings } from "@/services/siteSettingsService";

const PAID = ["paid", "partially_refunded", "refunded"];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

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

// ── Profit report (R10) ──────────────────────────────────────────────────────
export interface ProfitReport {
  windowDays: number | null;
  orders: number;
  goodsRevenue: number;      // Σ taxable_amount — goods, ex-GST, post-discount (the true top line)
  shippingCollected: number; // Σ shipping charged to customers (income)
  gstCollected: number;      // pass-through — collected & remitted, not profit (shown as a memo)
  cogs: number;              // Σ variant cost × qty
  packaging: number;         // orders × packagingPerOrder
  shippingCost: number;      // orders × shippingCostPerOrder (what we pay couriers)
  paymentFees: number;       // grossCollected × paymentFeePercent%
  profit: number;            // goodsRevenue + shippingCollected − cogs − packaging − shippingCost − paymentFees
  margin: number;            // profit / goodsRevenue %
  variantsMissingCost: number; // sold variants with cost 0 → profit is optimistic until filled
}

/**
 * P&L for a window. Revenue + shipping-collected are income; COGS (from per-variant
 * cost) + packaging + courier cost + payment-gateway fee are expenses; GST is a
 * pass-through memo, not profit. Cost inputs that orders can't tell us (packaging,
 * payment fee %, courier cost) come from editable site settings. Variants sold with
 * a zero cost are counted so the founder knows the profit is optimistic until costs
 * are entered — we never silently overstate margin.
 */
export async function getProfitReport(windowDays: number | null = 30): Promise<ProfitReport> {
  const db = createAdminClient() as any;
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;
  const settings = await getSiteSettings();
  const { packagingPerOrder, paymentFeePercent, shippingCostPerOrder } = settings.costs;

  let oq = db.from("orders").select("id,total_amount,taxable_amount,shipping_amount,cgst_amount,sgst_amount,igst_amount,placed_at,order_items(variant_id,quantity)").in("payment_status", PAID);
  if (cutoff) oq = oq.gte("placed_at", cutoff);
  const { data } = await oq;
  const orders = (data ?? []) as any[];

  // Cost lookup for every variant that sold in the window.
  const variantIds = [...new Set(orders.flatMap((o) => (o.order_items ?? []).map((it: any) => it.variant_id).filter(Boolean)))];
  const costMap = new Map<string, number>();
  if (variantIds.length) {
    const { data: vs } = await db.from("variants").select("id,cost_price").in("id", variantIds);
    for (const v of vs ?? []) costMap.set(v.id, Number(v.cost_price ?? 0));
  }

  let goodsRevenue = 0, shippingCollected = 0, gstCollected = 0, grossCollected = 0, cogs = 0;
  const missing = new Set<string>();
  for (const o of orders) {
    goodsRevenue += Number(o.taxable_amount ?? 0);
    shippingCollected += Number(o.shipping_amount ?? 0);
    gstCollected += Number(o.cgst_amount ?? 0) + Number(o.sgst_amount ?? 0) + Number(o.igst_amount ?? 0);
    grossCollected += Number(o.total_amount ?? 0);
    for (const it of o.order_items ?? []) {
      if (!it.variant_id) continue;
      const c = costMap.get(it.variant_id);
      cogs += (c ?? 0) * Number(it.quantity ?? 0);
      if (!c) missing.add(it.variant_id);
    }
  }

  const n = orders.length;
  const packaging = n * packagingPerOrder;
  const shippingCost = n * shippingCostPerOrder;
  const paymentFees = grossCollected * (paymentFeePercent / 100);
  const profit = goodsRevenue + shippingCollected - cogs - packaging - shippingCost - paymentFees;
  const margin = goodsRevenue > 0 ? r1((profit / goodsRevenue) * 100) : 0;

  return {
    windowDays, orders: n,
    goodsRevenue: r0(goodsRevenue), shippingCollected: r0(shippingCollected), gstCollected: r0(gstCollected),
    cogs: r0(cogs), packaging: r0(packaging), shippingCost: r0(shippingCost), paymentFees: r0(paymentFees),
    profit: r0(profit), margin, variantsMissingCost: missing.size,
  };
}

// ── Fragrance report (R12) ───────────────────────────────────────────────────
export interface FragranceRow { family: string; units: number; revenue: number; returned: number; returnRate: number }

/**
 * Performance by fragrance family — best/worst sellers by units + revenue, plus a
 * return rate (returned units ÷ sold units). Fragrance lives on the product, so we
 * map each sold line back to its product's family; lines whose product has no
 * family fall under "Unclassified" rather than being dropped.
 */
export async function getFragranceReport(windowDays: number | null = 90): Promise<FragranceRow[]> {
  const db = createAdminClient() as any;
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;

  let oq = db.from("orders").select("id,placed_at,order_items(product_id,variant_id,quantity,line_total)").in("payment_status", PAID);
  if (cutoff) oq = oq.gte("placed_at", cutoff);
  const { data } = await oq;
  const orders = (data ?? []) as any[];

  // product → fragrance family, and variant → product (to attribute returns).
  const productIds = [...new Set(orders.flatMap((o) => (o.order_items ?? []).map((it: any) => it.product_id).filter(Boolean)))];
  const familyOfProduct = new Map<string, string>();
  const familyOfVariant = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await db.from("products").select("id,fragrance_family").in("id", productIds);
    for (const p of prods ?? []) familyOfProduct.set(p.id, p.fragrance_family || "Unclassified");
    const { data: vars } = await db.from("variants").select("id,product_id").in("product_id", productIds);
    for (const v of vars ?? []) familyOfVariant.set(v.id, familyOfProduct.get(v.product_id) || "Unclassified");
  }

  const map = new Map<string, FragranceRow>();
  const get = (fam: string) => { let r = map.get(fam); if (!r) { r = { family: fam, units: 0, revenue: 0, returned: 0, returnRate: 0 }; map.set(fam, r); } return r; };
  for (const o of orders) for (const it of o.order_items ?? []) {
    const fam = familyOfProduct.get(it.product_id) || "Unclassified";
    const r = get(fam); r.units += Number(it.quantity ?? 0); r.revenue += Number(it.line_total ?? 0);
  }

  // Returned units by fragrance, over the same window (returns join to variant → product → family).
  let rq = db.from("return_items").select("variant_id,quantity,returns!inner(created_at,status)");
  if (cutoff) rq = rq.gte("returns.created_at", cutoff);
  const { data: retItems } = await rq;
  for (const ri of retItems ?? []) {
    const fam = ri.variant_id ? familyOfVariant.get(ri.variant_id) : null;
    if (fam && map.has(fam)) map.get(fam)!.returned += Number(ri.quantity ?? 0);
  }

  return [...map.values()].map((r) => ({
    ...r, revenue: r0(r.revenue), returnRate: r.units > 0 ? r1((r.returned / r.units) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

// ── Cohort report (R11) ──────────────────────────────────────────────────────
export interface CohortRow { cohort: string; size: number; retention: number[] }
export interface CohortReport { months: number; cohorts: CohortRow[] }

/**
 * Retention cohorts by acquisition month. Each customer's cohort = the month of
 * their FIRST paid order; retention[k] = how many of that cohort placed another
 * order k months later. Keyed by user_id when present, else email, so guests still
 * cohort by identity. Always computed over ALL history (cohorts are inherently
 * historical); `months` bounds how many follow-up columns to show.
 */
export async function getCohortReport(months = 6): Promise<CohortReport> {
  const db = createAdminClient() as any;
  const { data } = await db.from("orders").select("user_id,email,placed_at").in("payment_status", PAID).order("placed_at");
  const orders = (data ?? []) as any[];

  const ym = (iso: string) => { const d = new Date(iso); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }; // absolute month index
  const label = (idx: number) => { const y = Math.floor(idx / 12); const m = idx % 12; return `${y}-${String(m + 1).padStart(2, "0")}`; };

  // First-order month + the set of active months per customer.
  const first = new Map<string, number>();
  const active = new Map<string, Set<number>>();
  for (const o of orders) {
    const key = o.user_id || o.email; if (!key || !o.placed_at) continue;
    const m = ym(o.placed_at);
    if (!first.has(key) || m < first.get(key)!) first.set(key, m);
    (active.get(key) ?? active.set(key, new Set()).get(key)!).add(m);
  }

  const cohortMap = new Map<number, { size: number; ret: number[] }>();
  for (const [key, f] of first) {
    const c = cohortMap.get(f) ?? { size: 0, ret: Array(months + 1).fill(0) };
    c.size++;
    const months_active = active.get(key)!;
    for (let k = 0; k <= months; k++) if (months_active.has(f + k)) c.ret[k]++;
    cohortMap.set(f, c);
  }

  const cohorts = [...cohortMap.entries()].sort((a, b) => b[0] - a[0]).map(([idx, c]) => ({
    cohort: label(idx), size: c.size,
    retention: c.ret.map((n) => (c.size > 0 ? r1((n / c.size) * 100) : 0)),
  }));
  return { months, cohorts };
}
