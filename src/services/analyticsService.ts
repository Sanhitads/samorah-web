/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Analytics service (build #8) — the Insights module. Consumes events + records from
 * ALL the other modules (orders · refunds · shipments · returns · audit stream) into
 * one read-only picture: revenue, fulfillment throughput, delivery performance
 * (RTO/exception/avg time), logistics cost + revenue-after-shipping, return rate +
 * reasons, refunds, and per-courier performance. Everything is DERIVED — no new
 * tables. A time window (7/30/90 days or all) scopes every metric.
 */
import { createAdminClient } from "@/lib/supabase/admin";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}
const PAID = new Set(["paid", "partially_refunded", "refunded"]);
const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3.6e6;
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Analytics {
  windowDays: number | null;
  revenue: { gross: number; net: number; orders: number; aov: number; units: number };
  fulfillment: { avgPickMinutes: number | null; avgPackMinutes: number | null; avgCycleHours: number | null; shipped: number; delivered: number };
  delivery: { avgDeliveryHours: number | null; rtoRate: number; exceptionRate: number; shipments: number; deliveredCount: number };
  logistics: { shippingCostTotal: number; avgShippingCost: number | null; revenueAfterShipping: number };
  returns: { count: number; rate: number; byReason: { reason: string; count: number }[] };
  refunds: { count: number; total: number; rate: number };
  couriers: { courier: string; shipments: number; avgDeliveryHours: number | null; rtoRate: number }[];
}

export async function getAnalytics(windowDays: number | null = 30): Promise<Analytics> {
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;
  const db = loose();

  const ordersQ = db.from("orders").select("id,total_amount,refund_amount,status,payment_status,is_cod,placed_at,order_items(quantity)");
  const shipQ = db.from("shipments").select("status,shipping_cost,provider,courier_name,created_at,delivered_at,exception_reason");
  const returnsQ = db.from("returns").select("status,reason,refund_amount,created_at");
  const refundsQ = db.from("refunds").select("amount,status,created_at");
  const auditQ = db.from("audit_events").select("order_id,event,created_at").in("event", ["order.confirmed", "shipment.dispatched"]);

  const [oRes, sRes, rRes, fRes, aRes] = await Promise.all([
    cutoff ? ordersQ.gte("placed_at", cutoff) : ordersQ,
    cutoff ? shipQ.gte("created_at", cutoff) : shipQ,
    cutoff ? returnsQ.gte("created_at", cutoff) : returnsQ,
    cutoff ? refundsQ.gte("created_at", cutoff) : refundsQ,
    cutoff ? auditQ.gte("created_at", cutoff) : auditQ,
  ]);
  const orders = (oRes.data ?? []) as any[];
  const shipments = (sRes.data ?? []) as any[];
  const returns = (rRes.data ?? []) as any[];
  const refunds = (fRes.data ?? []) as any[];
  const events = (aRes.data ?? []) as any[];

  // ── Revenue ──
  const paid = orders.filter((o) => PAID.has(o.payment_status));
  const gross = paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const refundTotal = refunds.filter((r) => r.status === "processed").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const units = paid.reduce((s, o) => s + (o.order_items ?? []).reduce((u: number, it: any) => u + (it.quantity ?? 0), 0), 0);
  const revenue = { gross: round1(gross), net: round1(gross - refundTotal), orders: paid.length, aov: paid.length ? round1(gross / paid.length) : 0, units };

  // ── Fulfillment (cycle = order.confirmed → shipment.dispatched, per order) ──
  const confirmedAt = new Map<string, string>();
  const cycles: number[] = [];
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.event === "order.confirmed") confirmedAt.set(e.order_id, e.created_at);
    else if (e.event === "shipment.dispatched" && confirmedAt.has(e.order_id)) {
      cycles.push(hoursBetween(confirmedAt.get(e.order_id) as string, e.created_at));
      confirmedAt.delete(e.order_id);
    }
  }
  const { avgPickMinutes, avgPackMinutes } = await pickPackAverages(db, cutoff);
  const shippedCount = orders.filter((o) => ["shipped", "delivered"].includes(o.status)).length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;
  const fulfillment = { avgPickMinutes, avgPackMinutes, avgCycleHours: cycles.length ? round1(mean(cycles) as number) : null, shipped: shippedCount, delivered: deliveredOrders };

  // ── Delivery performance ──
  const deliveredShip = shipments.filter((s) => s.delivered_at);
  const deliveryTimes = deliveredShip.map((s) => hoursBetween(s.created_at, s.delivered_at));
  const rto = shipments.filter((s) => s.status === "rto").length;
  const exceptions = shipments.filter((s) => s.status === "exception" || s.exception_reason).length;
  const delivery = {
    avgDeliveryHours: deliveryTimes.length ? round1(mean(deliveryTimes) as number) : null,
    rtoRate: shipments.length ? round1((rto / shipments.length) * 100) : 0,
    exceptionRate: shipments.length ? round1((exceptions / shipments.length) * 100) : 0,
    shipments: shipments.length,
    deliveredCount: deliveredShip.length,
  };

  // ── Logistics cost / revenue-after-shipping ──
  const shippingCostTotal = shipments.reduce((s, x) => s + Number(x.shipping_cost ?? 0), 0);
  const logistics = {
    shippingCostTotal: round1(shippingCostTotal),
    avgShippingCost: shipments.length ? round1(shippingCostTotal / shipments.length) : null,
    revenueAfterShipping: round1(gross - refundTotal - shippingCostTotal),
  };

  // ── Returns ──
  const byReasonMap = new Map<string, number>();
  for (const r of returns) byReasonMap.set(r.reason ?? "unspecified", (byReasonMap.get(r.reason ?? "unspecified") ?? 0) + 1);
  const returnsBlock = {
    count: returns.length,
    rate: paid.length ? round1((returns.length / paid.length) * 100) : 0,
    byReason: [...byReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };

  // ── Refunds ──
  const processedRefunds = refunds.filter((r) => r.status === "processed");
  const refundsBlock = { count: processedRefunds.length, total: round1(refundTotal), rate: paid.length ? round1((processedRefunds.length / paid.length) * 100) : 0 };

  // ── Courier performance ──
  const courierMap = new Map<string, { shipments: number; times: number[]; rto: number }>();
  for (const s of shipments) {
    const key = s.courier_name || s.provider || "unknown";
    const c = courierMap.get(key) ?? { shipments: 0, times: [], rto: 0 };
    c.shipments++;
    if (s.delivered_at) c.times.push(hoursBetween(s.created_at, s.delivered_at));
    if (s.status === "rto") c.rto++;
    courierMap.set(key, c);
  }
  const couriers = [...courierMap.entries()].map(([courier, c]) => ({
    courier, shipments: c.shipments,
    avgDeliveryHours: c.times.length ? round1(mean(c.times) as number) : null,
    rtoRate: c.shipments ? round1((c.rto / c.shipments) * 100) : 0,
  })).sort((a, b) => b.shipments - a.shipments);

  return { windowDays, revenue, fulfillment, delivery, logistics, returns: returnsBlock, refunds: refundsBlock, couriers };
}

/** Avg pick/pack minutes from the audit stream, within the same window. */
async function pickPackAverages(db: any, cutoff: string | null): Promise<{ avgPickMinutes: number | null; avgPackMinutes: number | null }> {
  let q = db.from("audit_events").select("order_id,event,created_at").in("event", ["fulfillment.picking", "fulfillment.picked", "fulfillment.packing", "fulfillment.packed"]).order("created_at", { ascending: true });
  if (cutoff) q = q.gte("created_at", cutoff);
  const { data } = await q;
  const ev = (data ?? []) as any[];
  const dur = (start: string, end: string) => {
    const starts = new Map<string, number>();
    const out: number[] = [];
    for (const e of ev) {
      if (e.event === start) starts.set(e.order_id, new Date(e.created_at).getTime());
      else if (e.event === end && starts.has(e.order_id)) { out.push((new Date(e.created_at).getTime() - (starts.get(e.order_id) as number)) / 60000); starts.delete(e.order_id); }
    }
    return out.length ? round1(mean(out) as number) : null;
  };
  return { avgPickMinutes: dur("fulfillment.picking", "fulfillment.picked"), avgPackMinutes: dur("fulfillment.packing", "fulfillment.packed") };
}
