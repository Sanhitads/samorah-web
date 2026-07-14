/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Command Center (Dashboard v2) — the aggregations that turn the admin landing page
 * from a status board into an operational command center: sales trend, revenue
 * breakdown, inventory buckets, returns queue, unpublished drafts, customer snapshot,
 * cash flow, and marketing. Everything DERIVED — no new tables. Complements (does not
 * replace) getDashboardStats / getOperationalMetrics / getBusinessDashboard, which the
 * page still uses for headline counts + warehouse timing.
 *
 * Deliberately NOT included (no honest data source yet — surfaced as "needs integration"
 * on the page rather than faked): abandoned carts (no persisted cart table), email open
 * rate (no Resend webhooks), visitor→order conversion (GA4 is client-only), NPS/ratings
 * (no reviews table), Razorpay settlement dates (settlements not ingested).
 */
import { createAdminClient } from "@/lib/supabase/admin";

const PAID = ["paid", "partially_refunded", "refunded"];
const VIP_LTV = 15000; // matches customerAdminService.segmentOf
const r0 = (n: number) => Math.round(n);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface CommandCenter {
  trend: { today: number; yesterday: number; last7: number; last30: number; spark: number[] };
  revenue: { gross: number; shipping: number; tax: number; refunds: number; net: number };
  inventory: { critical: { id: string; name: string; stock: number }[]; criticalCount: number; warningCount: number; healthyCount: number };
  returnsQueue: { open: number; toQc: number; items: { id: string; rma: string; status: string }[] };
  draftsPending: { count: number; keys: string[] };
  customers: { new30: number; returning30: number; vip: number; active30: number };
  marketing: { topCoupon: { code: string; redemptions: number; discount: number } | null };
  cashflow: { received30: number; pendingCod: number; refunds30: number };
  shipmentsAwaitingPickup: number;
  founder: { repeatRate: number; ltv: number; refundRate: number };
}

export async function getCommandCenter(): Promise<CommandCenter> {
  const db = createAdminClient() as any;
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday.getTime() - 86400000);
  const cut7 = new Date(now - 7 * 86400000);
  const cut30 = new Date(now - 30 * 86400000);
  const cut14 = new Date(now - 14 * 86400000);

  const [ordersRes, allPaidRes, variantsRes, returnsRes, draftsRes, shipmentsRes] = await Promise.all([
    // 30d paid orders — trend, revenue breakdown, cash flow, coupons
    db.from("orders")
      .select("total_amount,shipping_amount,cgst_amount,sgst_amount,igst_amount,refund_amount,placed_at,is_cod,coupon_code,discount_amount")
      .in("payment_status", PAID).gte("placed_at", cut30.toISOString()),
    // all-time paid orders (minimal) — customer segments (lifetime LTV / new vs returning)
    db.from("orders").select("user_id,email,total_amount,placed_at").in("payment_status", PAID),
    // active variants — inventory buckets
    db.from("variants").select("id,stock,low_stock_threshold,products(name)").eq("is_active", true),
    // open returns — QC queue
    db.from("returns").select("id,rma_number,status").in("status", ["requested", "approved", "pickup_scheduled", "received", "qc"]).order("created_at", { ascending: true }).limit(50),
    // unpublished CMS drafts
    db.from("composed_pages").select("page_key,status").eq("status", "draft"),
    // shipments created/assigned but not yet picked up
    db.from("shipments").select("id", { count: "exact", head: true }).in("status", ["shipment_created", "courier_assigned"]),
  ]);

  const orders = (ordersRes.data ?? []) as any[];

  // ── Sales trend + revenue breakdown (single 30d pass) ──
  let today = 0, yesterday = 0, last7 = 0, last30 = 0, shipping = 0, tax = 0, refunds = 0;
  const spark = new Map<string, number>(); // 14-day daily revenue
  for (let i = 13; i >= 0; i--) spark.set(dayKey(new Date(now - i * 86400000)), 0);
  for (const o of orders) {
    const amt = Number(o.total_amount ?? 0);
    const at = new Date(o.placed_at);
    last30 += amt;
    if (at >= startToday) today += amt;
    else if (at >= startYesterday) yesterday += amt;
    if (at >= cut7) last7 += amt;
    shipping += Number(o.shipping_amount ?? 0);
    tax += Number(o.cgst_amount ?? 0) + Number(o.sgst_amount ?? 0) + Number(o.igst_amount ?? 0);
    refunds += Number(o.refund_amount ?? 0);
    if (at >= cut14) { const k = dayKey(at); if (spark.has(k)) spark.set(k, (spark.get(k) ?? 0) + amt); }
  }

  // ── Cash flow (30d) ──
  const pendingCodRes = await db.from("orders").select("total_amount").eq("is_cod", true).in("status", ["confirmed", "processing", "packed", "shipped"]);
  const pendingCod = ((pendingCodRes.data ?? []) as any[]).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);

  // ── Coupons (top by redemptions, 30d) ──
  const coup = new Map<string, { redemptions: number; discount: number }>();
  for (const o of orders) {
    if (!o.coupon_code) continue;
    const c = coup.get(o.coupon_code) ?? { redemptions: 0, discount: 0 };
    c.redemptions++; c.discount += Number(o.discount_amount ?? 0); coup.set(o.coupon_code, c);
  }
  let topCoupon: CommandCenter["marketing"]["topCoupon"] = null;
  for (const [code, v] of coup) if (!topCoupon || v.redemptions > topCoupon.redemptions) topCoupon = { code, redemptions: v.redemptions, discount: r0(v.discount) };

  // ── Inventory buckets ──
  const variants = (variantsRes.data ?? []) as any[];
  const critical: { id: string; name: string; stock: number }[] = [];
  let warningCount = 0, healthyCount = 0;
  for (const v of variants) {
    const stock = Number(v.stock ?? 0);
    const thr = Number(v.low_stock_threshold ?? 0);
    const name = v.products?.name ?? "Variant";
    if (stock <= 0 || stock <= Math.floor(thr / 2)) critical.push({ id: v.id, name, stock });
    else if (stock <= thr) warningCount++;
    else healthyCount++;
  }
  critical.sort((a, b) => a.stock - b.stock);

  // ── Returns queue ──
  const returnsRows = (returnsRes.data ?? []) as any[];
  const returnsQueue = {
    open: returnsRows.length,
    toQc: returnsRows.filter((r) => ["received", "qc"].includes(r.status)).length,
    items: returnsRows.slice(0, 6).map((r) => ({ id: r.id, rma: r.rma_number ?? r.id.slice(0, 8), status: r.status })),
  };

  // ── Drafts ──
  const draftKeys = ((draftsRes.data ?? []) as any[]).map((d) => d.page_key);

  // ── Customer segments (lifetime) ──
  const allPaid = (allPaidRes.data ?? []) as any[];
  const byCust = new Map<string, { orders: number; ltv: number; firstAt: number; lastAt: number }>();
  for (const o of allPaid) {
    const k = o.user_id || o.email; if (!k) continue;
    const at = new Date(o.placed_at).getTime();
    const c = byCust.get(k) ?? { orders: 0, ltv: 0, firstAt: at, lastAt: at };
    c.orders++; c.ltv += Number(o.total_amount ?? 0); c.firstAt = Math.min(c.firstAt, at); c.lastAt = Math.max(c.lastAt, at);
    byCust.set(k, c);
  }
  const cut30ms = cut30.getTime();
  let new30 = 0, returning30 = 0, active30 = 0, vip = 0, ltvSum = 0, repeatCount = 0;
  for (const c of byCust.values()) {
    ltvSum += c.ltv;
    if (c.orders >= 2) repeatCount++;
    if (c.ltv >= VIP_LTV || c.orders >= 5) vip++;
    if (c.lastAt >= cut30ms) {
      active30++;
      if (c.firstAt >= cut30ms) new30++; else returning30++;
    }
  }
  const totalCust = byCust.size;

  // ── Refund rate (30d, by count) ──
  const refundedOrders = orders.filter((o) => Number(o.refund_amount ?? 0) > 0).length;

  return {
    trend: { today: r0(today), yesterday: r0(yesterday), last7: r0(last7), last30: r0(last30), spark: [...spark.values()].map(r0) },
    revenue: { gross: r0(last30), shipping: r0(shipping), tax: r0(tax), refunds: r0(refunds), net: r0(last30 - tax - refunds) },
    inventory: { critical: critical.slice(0, 6), criticalCount: critical.length, warningCount, healthyCount },
    returnsQueue,
    draftsPending: { count: draftKeys.length, keys: draftKeys },
    customers: { new30, returning30, vip, active30 },
    marketing: { topCoupon },
    cashflow: { received30: r0(last30), pendingCod: r0(pendingCod), refunds30: r0(refunds) },
    shipmentsAwaitingPickup: (shipmentsRes as { count: number | null }).count ?? 0,
    founder: {
      repeatRate: totalCust ? Math.round((repeatCount / totalCust) * 1000) / 10 : 0,
      ltv: totalCust ? r0(ltvSum / totalCust) : 0,
      refundRate: orders.length ? Math.round((refundedOrders / orders.length) * 1000) / 10 : 0,
    },
  };
}
