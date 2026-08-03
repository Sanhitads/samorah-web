/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon analytics (Phase 3 · point 23) — READ-ONLY reporting over the canonical Phase-1/2 ledger.
 *
 * All financial aggregation happens HERE (server/service-side), never in React. The list uses ONE
 * bulk query (no N+1); per-coupon detail + drill-down use targeted queries scoped to the coupon's
 * orders. Every figure comes from immutable snapshots — `coupon_redemptions.discount_paise` (gross
 * benefit) and the `orders` money summary — so changing a coupon's config never rewrites history.
 *
 * Qualifying redemption (proves payment success — see the restore RPC analysis):
 *   state ∈ (consumed, restored)  AND  consumed_at IS NOT NULL  AND  order.payment_status ∈ PAID
 * `reserved`, `released`, and restored-but-never-paid rows are all excluded. The money maths (Model A
 * merchandise-only split, conservative refund netting) lives in the pure, unit-tested lib.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attributeOrder,
  type OrderMoney,
  type OrderCoupon,
} from "@/lib/couponAttribution";
import { isQualifyingRedemption, QUALIFYING_REDEMPTION_STATES } from "@/lib/couponRedemptionQualify";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

const paise = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/** The redemption + its order + the coupon's current type, as stored. */
const JOIN =
  "coupon_id, order_id, state, consumed_at, discount_paise, identity, coupons(type), " +
  "orders(id, order_number, created_at, payment_status, subtotal, discount_amount, loyalty_discount, refund_amount, total_amount, email, ship_full_name)";

interface QRow {
  couponId: string;
  orderId: string;
  discountPaise: number;
  identity: string;
  isFreeShipping: boolean;
  order: {
    id: string;
    orderNumber: string;
    createdAt: string;
    paymentStatus: string;
    totalPaise: number;
    money: OrderMoney;
    customer: string;
  } | null;
}

/** Map a raw joined row → QRow, or null if it is not a payment-proven qualifying redemption. */
function toQRow(r: any): QRow | null {
  const o = r.orders;
  // The ONE centralized payment-proven gate — identical rule for every analytics path.
  if (!isQualifyingRedemption({ state: r.state, consumedAt: r.consumed_at, orderPaymentStatus: o?.payment_status })) return null;
  if (!r.coupon_id) return null; // orphaned (coupon deleted) — can't attribute to a live coupon
  return {
    couponId: r.coupon_id,
    orderId: r.order_id,
    discountPaise: Math.max(0, Math.round(Number(r.discount_paise ?? 0))),
    identity: String(r.identity ?? ""),
    isFreeShipping: (r.coupons?.type ?? "") === "free_shipping",
    order: {
      id: o.id,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      paymentStatus: o.payment_status,
      totalPaise: paise(o.total_amount),
      customer: o.ship_full_name || o.email || "—",
      money: {
        orderId: o.id,
        subtotalPaise: paise(o.subtotal),
        discountPaise: paise(o.discount_amount),
        loyaltyDiscountPaise: paise(o.loyalty_discount),
        refundPaise: paise(o.refund_amount),
        paymentStatus: o.payment_status,
      },
    },
  };
}

/** Load qualifying redemptions (optionally scoped to a set of order ids). Non-paid orders dropped. */
async function loadQualifying(orderIds?: string[]): Promise<QRow[]> {
  const db = loose();
  // Pre-filter by the cheap ledger conditions in SQL (state + payment stamp); the authoritative
  // qualifying decision (incl. order payment_status) is re-applied per row via isQualifyingRedemption.
  let q = db
    .from("coupon_redemptions")
    .select(JOIN)
    .in("state", QUALIFYING_REDEMPTION_STATES as unknown as string[])
    .not("consumed_at", "is", null);
  if (orderIds) {
    if (!orderIds.length) return [];
    q = q.in("order_id", orderIds);
  }
  const { data } = await q;
  return (data ?? []).map(toQRow).filter((r: QRow | null): r is QRow => r !== null);
}

/** Group qualifying rows by order → its money summary + the coupons on it (for the pro-rata split). */
function groupByOrder(rows: QRow[]): Map<string, { money: OrderMoney; coupons: OrderCoupon[] }> {
  const byOrder = new Map<string, { money: OrderMoney; coupons: OrderCoupon[] }>();
  for (const r of rows) {
    if (!r.order) continue;
    const g = byOrder.get(r.orderId) ?? { money: r.order.money, coupons: [] };
    g.coupons.push({ couponId: r.couponId, discountPaise: r.discountPaise, isFreeShipping: r.isFreeShipping });
    byOrder.set(r.orderId, g);
  }
  return byOrder;
}

// ── Bulk summary for the list (point 21) — ONE query, aggregated server-side ─────────────────────────
export interface CouponSummaryMetrics {
  attributedRevenuePaise: number; // net merchandise, Model A (0 for a free-ship coupon)
  grossDiscountPaise: number; // Σ ledger benefit (not clawed back on refund)
  successfulRedemptions: number; // qualifying redemptions = distinct orders for this coupon
}

/** Per-coupon Attributed Revenue + Gross Discount + redemptions for EVERY coupon with usage. */
export async function couponAnalyticsSummary(): Promise<Map<string, CouponSummaryMetrics>> {
  const rows = await loadQualifying();
  const byOrder = groupByOrder(rows);
  const out = new Map<string, CouponSummaryMetrics>();
  for (const { money, coupons } of byOrder.values()) {
    const alloc = attributeOrder(money, coupons);
    for (const c of coupons) {
      const agg = out.get(c.couponId) ?? { attributedRevenuePaise: 0, grossDiscountPaise: 0, successfulRedemptions: 0 };
      agg.attributedRevenuePaise += alloc.get(c.couponId) ?? 0;
      agg.grossDiscountPaise += c.discountPaise;
      agg.successfulRedemptions += 1;
      out.set(c.couponId, agg);
    }
  }
  return out;
}

// ── Per-coupon detail (point 23) ─────────────────────────────────────────────────────────────────────
export interface CouponAnalytics {
  couponId: string;
  isFreeShipping: boolean;
  successfulRedemptions: number;
  ordersUsingCoupon: number;
  uniqueCustomers: number; // distinct redeeming identities
  grossDiscountPaise: number;
  attributedRevenuePaise: number;
  attributedAovPaise: number | null; // attributed revenue / orders
  avgDiscountPerOrderPaise: number | null; // gross discount / orders
  usedCount: number; // includes live reservations (capacity accounting)
  maxUses: number | null;
  efficiencyRatio: number | null; // ₹ attributed revenue per ₹1 gross discount (NOT ROI/ROAS/profit)
}

/** Detailed analytics for one coupon. Scopes to the coupon's orders, then loads ALL qualifying
 *  redemptions on those orders so the pro-rata denominator is correct. */
export async function getCouponAnalytics(couponId: string): Promise<CouponAnalytics> {
  const db = loose();
  const mine = await loadQualifying(); // full set once; filter to this coupon's orders below
  const myRows = mine.filter((r) => r.couponId === couponId);
  const orderIds = [...new Set(myRows.map((r) => r.orderId))];
  const byOrder = groupByOrder(mine.filter((r) => orderIds.includes(r.orderId)));

  let attributed = 0;
  for (const oid of orderIds) {
    const g = byOrder.get(oid);
    if (g) attributed += attributeOrder(g.money, g.coupons).get(couponId) ?? 0;
  }
  const grossDiscount = myRows.reduce((s, r) => s + r.discountPaise, 0);
  const orders = orderIds.length;
  const uniqueCustomers = new Set(myRows.map((r) => r.identity)).size;
  const isFreeShipping = myRows[0]?.isFreeShipping ?? false;

  const { data: c } = await db.from("coupons").select("used_count, max_uses").eq("id", couponId).maybeSingle();

  return {
    couponId,
    isFreeShipping,
    successfulRedemptions: myRows.length,
    ordersUsingCoupon: orders,
    uniqueCustomers,
    grossDiscountPaise: grossDiscount,
    attributedRevenuePaise: attributed,
    attributedAovPaise: orders > 0 ? Math.round(attributed / orders) : null,
    avgDiscountPerOrderPaise: orders > 0 ? Math.round(grossDiscount / orders) : null,
    usedCount: Number(c?.used_count ?? 0),
    maxUses: c?.max_uses != null ? Number(c.max_uses) : null,
    efficiencyRatio: grossDiscount > 0 ? attributed / grossDiscount : null,
  };
}

// ── Contributing-orders drill-down (point 23) — read-only, auditable ─────────────────────────────────
export interface ContributingOrder {
  orderNumber: string;
  createdAt: string;
  customer: string;
  orderValuePaise: number; // the order's actual total (context only, not the attribution base)
  couponDiscountPaise: number; // this coupon's ledger benefit on the order
  attributedRevenuePaise: number; // this coupon's net-merchandise share (0 for free-ship)
  paymentState: string; // paid | partially_refunded | refunded
}

/** The orders a coupon contributed to, with per-order attribution — so "why ₹X?" is inspectable. */
export async function listContributingOrders(couponId: string): Promise<ContributingOrder[]> {
  const all = await loadQualifying();
  const myRows = all.filter((r) => r.couponId === couponId);
  const orderIds = [...new Set(myRows.map((r) => r.orderId))];
  const byOrder = groupByOrder(all.filter((r) => orderIds.includes(r.orderId)));

  const rows: ContributingOrder[] = [];
  for (const r of myRows) {
    if (!r.order) continue;
    const g = byOrder.get(r.orderId);
    const attributed = g ? attributeOrder(g.money, g.coupons).get(couponId) ?? 0 : 0;
    rows.push({
      orderNumber: r.order.orderNumber,
      createdAt: r.order.createdAt,
      customer: r.order.customer,
      orderValuePaise: r.order.totalPaise,
      couponDiscountPaise: r.discountPaise,
      attributedRevenuePaise: attributed,
      paymentState: r.order.paymentStatus,
    });
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
  return rows;
}
