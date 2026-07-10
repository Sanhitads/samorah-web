/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CRM / Customer 360 (Phase 3). A customer's full picture — profile, orders,
 * addresses, returns, lifetime value, notes/tags, marketing consent — assembled
 * from data that already exists (users · orders · addresses · returns). Segment
 * (New/Repeat/VIP) is derived from order stats.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { channelOf } from "@/lib/marketing/channel";

const PAID = ["paid", "partially_refunded", "refunded"];
const VIP_LTV = 15000;

export type Segment = "vip" | "repeat" | "new";
export function segmentOf(paidOrders: number, ltv: number): Segment {
  if (ltv >= VIP_LTV || paidOrders >= 5) return "vip";
  if (paidOrders >= 2) return "repeat";
  return "new";
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orders: number;
  ltv: number;
  segment: Segment;
  marketingConsent: boolean;
  tags: string[];
  createdAt: string;
}

/** Customer list with order aggregates (LTV, count), searchable. */
export async function listCustomers(opts: { search?: string; limit?: number } = {}): Promise<CustomerRow[]> {
  const db = createAdminClient() as any;
  let q = db.from("users").select("id,email,full_name,phone,marketing_consent,tags,created_at").eq("role", "customer").order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.search) {
    const s = opts.search.trim().replace(/[%,]/g, "");
    q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  const { data: users } = await q;
  const ids = (users ?? []).map((u: any) => u.id);
  const agg = new Map<string, { orders: number; ltv: number }>();
  if (ids.length) {
    const { data: orders } = await db.from("orders").select("user_id,total_amount,payment_status").in("user_id", ids).in("payment_status", PAID);
    for (const o of orders ?? []) {
      const a = agg.get(o.user_id) ?? { orders: 0, ltv: 0 };
      a.orders++; a.ltv += Number(o.total_amount ?? 0);
      agg.set(o.user_id, a);
    }
  }
  return (users ?? []).map((u: any) => {
    const a = agg.get(u.id) ?? { orders: 0, ltv: 0 };
    return {
      id: u.id, name: u.full_name ?? u.email, email: u.email, phone: u.phone,
      orders: a.orders, ltv: Math.round(a.ltv), segment: segmentOf(a.orders, a.ltv),
      marketingConsent: Boolean(u.marketing_consent), tags: Array.isArray(u.tags) ? u.tags : [], createdAt: u.created_at,
    };
  });
}

export interface Customer360 {
  id: string; name: string; email: string; phone: string | null;
  marketingConsent: boolean; loyaltyPoints: number; loyaltyTier: string; birthday: string | null;
  notes: string | null; tags: string[]; segment: Segment;
  orders: { orderNumber: string; status: string; total: number; placedAt: string }[];
  addresses: { line1: string; line2: string | null; city: string; state: string; pincode: string; isDefault: boolean }[];
  returns: { rma: string; status: string; reason: string | null; createdAt: string }[];
  ltv: number; aov: number; orderCount: number;
  // CRM additions (R13)
  favouriteFragrance: string | null;                                  // most-purchased family across paid orders
  acquisition: { source: string; medium: string; campaign: string; channel: string } | null; // first order's UTMs, normalised to a channel
  wishlist: { product: string; fragrance: string | null; addedAt: string }[];
  // Marketing insight (derived from order lines)
  favouriteCollection: string | null;   // most-purchased collection
  favouritePriceRange: string | null;   // price band they buy in most
  preferredJarSize: string | null;      // size they buy most
}

export async function getCustomer360(id: string): Promise<Customer360 | null> {
  const db = createAdminClient() as any;
  const { data: u } = await db.from("users").select("*").eq("id", id).maybeSingle();
  if (!u) return null;

  const [ordersRes, addrRes, retRes, itemsRes, wishRes] = await Promise.all([
    db.from("orders").select("id,order_number,status,total_amount,payment_status,placed_at,utm_source,utm_medium,utm_campaign").eq("user_id", id).order("placed_at", { ascending: false }),
    db.from("addresses").select("line1,line2,city,state,pincode,is_default").eq("user_id", id).order("is_default", { ascending: false }),
    db.from("returns").select("rma_number,status,reason,created_at,order_id,orders!inner(user_id)").eq("orders.user_id", id).order("created_at", { ascending: false }),
    db.from("order_items").select("product_id,quantity,unit_price,collection_name,size,orders!inner(user_id,payment_status)").eq("orders.user_id", id).in("orders.payment_status", PAID),
    db.from("wishlists").select("product_id,created_at,products(name,fragrance_family)").eq("user_id", id).order("created_at", { ascending: false }),
  ]);

  const orders = (ordersRes.data ?? []) as any[];
  const paid = orders.filter((o) => PAID.includes(o.payment_status));
  const ltv = Math.round(paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0));
  const aov = paid.length ? Math.round(ltv / paid.length) : 0;

  // Acquisition = the earliest order's UTMs (orders are desc, so the last is oldest).
  const firstOrder = orders.length ? orders[orders.length - 1] : null;
  const acquisition = firstOrder && (firstOrder.utm_source || firstOrder.utm_medium || firstOrder.utm_campaign)
    ? { source: firstOrder.utm_source || "direct", medium: firstOrder.utm_medium || "—", campaign: firstOrder.utm_campaign || "—", channel: channelOf(firstOrder.utm_source, firstOrder.utm_medium) }
    : null;

  // Most-frequent value of a field across paid lines, weighted by quantity (mode).
  const items = (itemsRes.data ?? []) as any[];
  const modeBy = (pick: (it: any) => string | null | undefined): string | null => {
    const t = new Map<string, number>();
    for (const it of items) { const k = pick(it); if (k) t.set(k, (t.get(k) ?? 0) + Number(it.quantity ?? 0)); }
    return [...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  // Favourite fragrance — needs a product→family lookup; the rest read straight off the line.
  let favouriteFragrance: string | null = null;
  if (items.length) {
    const pids = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
    const famOf = new Map<string, string>();
    if (pids.length) { const { data: prods } = await db.from("products").select("id,fragrance_family").in("id", pids); for (const p of prods ?? []) famOf.set(p.id, p.fragrance_family || "Unclassified"); }
    favouriteFragrance = modeBy((it) => famOf.get(it.product_id));
  }

  const favouriteCollection = modeBy((it) => it.collection_name);
  const preferredJarSize = modeBy((it) => it.size);
  const favouritePriceRange = modeBy((it) => priceBand(Number(it.unit_price ?? 0)));

  const wishlist = ((wishRes.data ?? []) as any[]).map((w) => ({
    product: w.products?.name ?? "—", fragrance: w.products?.fragrance_family ?? null, addedAt: w.created_at,
  }));

  return {
    id: u.id, name: u.full_name ?? u.email, email: u.email, phone: u.phone,
    marketingConsent: Boolean(u.marketing_consent), loyaltyPoints: Number(u.loyalty_points ?? 0), loyaltyTier: u.loyalty_tier, birthday: u.birthday,
    notes: u.admin_notes ?? null, tags: Array.isArray(u.tags) ? u.tags : [], segment: segmentOf(paid.length, ltv),
    orders: orders.map((o) => ({ orderNumber: o.order_number, status: o.status, total: Number(o.total_amount), placedAt: o.placed_at })),
    addresses: (addrRes.data ?? []).map((a: any) => ({ line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: Boolean(a.is_default) })),
    returns: (retRes.data ?? []).map((r: any) => ({ rma: r.rma_number, status: r.status, reason: r.reason, createdAt: r.created_at })),
    ltv, aov, orderCount: paid.length,
    favouriteFragrance, acquisition, wishlist,
    favouriteCollection, favouritePriceRange, preferredJarSize,
  };
}

/** Price bands for the "favourite price range" insight (₹, per-unit). */
function priceBand(unit: number): string | null {
  if (!unit || unit <= 0) return null;
  if (unit < 800) return "Under ₹800";
  if (unit < 1500) return "₹800–1,499";
  if (unit < 2500) return "₹1,500–2,499";
  return "₹2,500+";
}

export async function setCustomerNotes(id: string, notes: string, actorId?: string) {
  const db = createAdminClient() as any;
  const { error } = await db.from("users").update({ admin_notes: notes || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "customer.note_set", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}
export async function setCustomerTags(id: string, tags: string[], actorId?: string) {
  const clean = [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 12);
  const db = createAdminClient() as any;
  const { error } = await db.from("users").update({ tags: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "customer.tagged", actorType: actorId ? "staff" : "system", actorId, notes: clean.join(", ") });
  return { ok: true };
}
