/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CRM / Customer 360 (Phase 3). A customer's full picture — profile, orders,
 * addresses, returns, lifetime value, notes/tags, marketing consent — assembled
 * from data that already exists (users · orders · addresses · returns). Segment
 * (New/Repeat/VIP) is derived from order stats.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent, type AuditEvent } from "@/services/auditService";
import { channelOf } from "@/lib/marketing/channel";
import { customerHealth, type CustomerHealth } from "@/lib/customer/health";

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
  aov: number;
  lastOrderAt: string | null;
  segment: Segment;
  health: CustomerHealth;
  marketingConsent: boolean;
  newsletter: boolean;
  wholesale: boolean;
  tags: string[];
  createdAt: string;
}

/** Search + filter set for the customer board (review priority 1.2 / 1.3). */
export interface CustomerFilter {
  search?: string;
  segment?: string; // vip | repeat | new
  health?: string; // healthy | at_risk | inactive | lost | new
  newsletter?: string; // "1" subscribed | "0" not
  wholesale?: string; // "1"
  ltv?: string; // 0-1000 | 1000-5000 | 5000+
  orders?: string; // 0 | 1-5 | 5+ | 10+
  lastOrder?: string; // 7d | 30d | 90d | 1y
  since?: string; // 30d | 90d | 1y
  limit?: number;
}

function withinDays(iso: string | null, days: number, now: number): boolean {
  if (!iso) return false;
  return now - new Date(iso).getTime() <= days * 86_400_000;
}

/**
 * Customer list with order aggregates (LTV, count, AOV, last order), a derived health verdict, and
 * newsletter / wholesale flags — searchable across name / email / phone / customer id / order number /
 * city, and filterable. Enrichment is done over a bounded fetch (500 customers + their orders) with
 * filtering in-process, the same pragmatic pattern as the other admin boards.
 */
export async function listCustomers(opts: CustomerFilter = {}): Promise<CustomerRow[]> {
  const db = createAdminClient() as any;
  const now = Date.now();
  const { data: users } = await db.from("users").select("id,email,full_name,phone,marketing_consent,tags,created_at").eq("role", "customer").order("created_at", { ascending: false }).limit(opts.limit ?? 500);
  const ids = (users ?? []).map((u: any) => u.id);

  // Per-customer order aggregates + a searchable blob (order numbers + cities) for advanced search.
  const agg = new Map<string, { orders: number; ltv: number; lastOrderAt: string | null; blob: string }>();
  if (ids.length) {
    const { data: orders } = await db.from("orders").select("user_id,order_number,total_amount,payment_status,placed_at,ship_city").in("user_id", ids);
    for (const o of orders ?? []) {
      const a = agg.get(o.user_id) ?? { orders: 0, ltv: 0, lastOrderAt: null, blob: "" };
      a.blob += ` ${o.order_number ?? ""} ${o.ship_city ?? ""}`;
      if (PAID.includes(o.payment_status)) {
        a.orders++; a.ltv += Number(o.total_amount ?? 0);
        if (o.placed_at && (!a.lastOrderAt || o.placed_at > a.lastOrderAt)) a.lastOrderAt = o.placed_at;
      }
      agg.set(o.user_id, a);
    }
  }

  // Wholesale set (dedicated table; may be empty pre-launch — tag is the fallback signal).
  const wholesaleIds = new Set<string>();
  try { const { data: ws } = await db.from("wholesale_customers").select("user_id"); for (const w of ws ?? []) if (w.user_id) wholesaleIds.add(w.user_id); } catch { /* table may not exist */ }

  let rows: CustomerRow[] = (users ?? []).map((u: any) => {
    const a = agg.get(u.id) ?? { orders: 0, ltv: 0, lastOrderAt: null, blob: "" };
    const tags = Array.isArray(u.tags) ? u.tags : [];
    const ltv = Math.round(a.ltv);
    return {
      id: u.id, name: u.full_name ?? u.email, email: u.email, phone: u.phone,
      orders: a.orders, ltv, aov: a.orders ? Math.round(ltv / a.orders) : 0, lastOrderAt: a.lastOrderAt,
      segment: segmentOf(a.orders, ltv), health: customerHealth(a.lastOrderAt, a.orders, now),
      marketingConsent: Boolean(u.marketing_consent), newsletter: Boolean(u.marketing_consent),
      wholesale: wholesaleIds.has(u.id) || tags.map((t: string) => t.toLowerCase()).includes("wholesale"),
      tags, createdAt: u.created_at,
      _blob: `${u.full_name ?? ""} ${u.email} ${u.phone ?? ""} ${u.id}${a.blob}`.toLowerCase(),
    } as CustomerRow & { _blob: string };
  });

  // Filters (in-process).
  if (opts.search) { const s = opts.search.trim().toLowerCase(); rows = rows.filter((r) => (r as any)._blob.includes(s)); }
  if (opts.segment) rows = rows.filter((r) => r.segment === opts.segment);
  if (opts.health) rows = rows.filter((r) => r.health.key === opts.health);
  if (opts.newsletter === "1") rows = rows.filter((r) => r.newsletter);
  else if (opts.newsletter === "0") rows = rows.filter((r) => !r.newsletter);
  if (opts.wholesale === "1") rows = rows.filter((r) => r.wholesale);
  if (opts.ltv === "0-1000") rows = rows.filter((r) => r.ltv < 1000);
  else if (opts.ltv === "1000-5000") rows = rows.filter((r) => r.ltv >= 1000 && r.ltv < 5000);
  else if (opts.ltv === "5000+") rows = rows.filter((r) => r.ltv >= 5000);
  if (opts.orders === "0") rows = rows.filter((r) => r.orders === 0);
  else if (opts.orders === "1-5") rows = rows.filter((r) => r.orders >= 1 && r.orders <= 5);
  else if (opts.orders === "5+") rows = rows.filter((r) => r.orders >= 5);
  else if (opts.orders === "10+") rows = rows.filter((r) => r.orders >= 10);
  if (opts.lastOrder) { const d = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[opts.lastOrder]; if (d) rows = rows.filter((r) => withinDays(r.lastOrderAt, d, now)); }
  if (opts.since) { const d = { "30d": 30, "90d": 90, "1y": 365 }[opts.since]; if (d) rows = rows.filter((r) => withinDays(r.createdAt, d, now)); }

  // Strip the internal search blob before returning.
  return rows.map(({ ...r }) => { delete (r as any)._blob; return r; }).slice(0, 200);
}

export interface CustomerCounts {
  total: number; new30d: number; returning: number; vip: number;
  newsletter: number; wholesale: number; avgLtv: number;
}

/** Analytics-strip metrics (review priority 1.1). Computed over the customer base + paid orders. */
export async function getCustomerCounts(): Promise<CustomerCounts> {
  const db = createAdminClient() as any;
  const now = Date.now();
  const { data: users } = await db.from("users").select("id,marketing_consent,tags,created_at").eq("role", "customer").limit(5000);
  const ids = (users ?? []).map((u: any) => u.id);
  const agg = new Map<string, { orders: number; ltv: number }>();
  if (ids.length) {
    const { data: orders } = await db.from("orders").select("user_id,total_amount,payment_status").in("user_id", ids).in("payment_status", PAID);
    for (const o of orders ?? []) { const a = agg.get(o.user_id) ?? { orders: 0, ltv: 0 }; a.orders++; a.ltv += Number(o.total_amount ?? 0); agg.set(o.user_id, a); }
  }
  const wholesaleIds = new Set<string>();
  try { const { data: ws } = await db.from("wholesale_customers").select("user_id"); for (const w of ws ?? []) if (w.user_id) wholesaleIds.add(w.user_id); } catch { /* optional */ }

  let newsletter = 0, wholesale = 0, returning = 0, vip = 0, ltvSum = 0, withOrders = 0;
  for (const u of users ?? []) {
    if (u.marketing_consent) newsletter++;
    const tags = (Array.isArray(u.tags) ? u.tags : []).map((t: string) => t.toLowerCase());
    if (wholesaleIds.has(u.id) || tags.includes("wholesale")) wholesale++;
    const a = agg.get(u.id) ?? { orders: 0, ltv: 0 };
    if (a.orders >= 2) returning++;
    if (segmentOf(a.orders, a.ltv) === "vip") vip++;
    if (a.orders > 0) { ltvSum += a.ltv; withOrders++; }
  }
  const new30d = (users ?? []).filter((u: any) => now - new Date(u.created_at).getTime() <= 30 * 86_400_000).length;
  return { total: (users ?? []).length, new30d, returning, vip, newsletter, wholesale, avgLtv: withOrders ? Math.round(ltvSum / withOrders) : 0 };
}

export interface Customer360 {
  id: string; name: string; email: string; phone: string | null;
  marketingConsent: boolean; loyaltyPoints: number; loyaltyTier: string; birthday: string | null;
  notes: string | null; tags: string[]; segment: Segment;
  orders: { orderNumber: string; status: string; total: number; placedAt: string }[];
  addresses: { line1: string; line2: string | null; city: string; state: string; pincode: string; isDefault: boolean }[];
  returns: { rma: string; status: string; reason: string | null; createdAt: string }[];
  ltv: number; aov: number; orderCount: number;
  // Customer 360 additions (review sections 1, 9, 11, 14–16)
  createdAt: string;                 // customer since
  phoneDigits: string | null;        // for WhatsApp deep-link
  health: CustomerHealth;
  lastOrderAt: string | null;
  highestOrder: number;
  totalReturns: number;
  refundTotal: number;
  replacementCount: number;
  failedPayments: number;
  rtoCount: number;
  fraudFlag: boolean;
  wholesale: boolean;
  flags: { key: string; label: string; tone: string }[];  // derived operational flags
  consent: { channel: string; state: "in" | "out" | "unknown" }[]; // per-channel (display only)
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

  const [ordersRes, addrRes, retRes, itemsRes, wishRes, wsRes] = await Promise.all([
    db.from("orders").select("id,order_number,status,total_amount,payment_status,placed_at,refund_amount,fraud_review,ndr_status,utm_source,utm_medium,utm_campaign").eq("user_id", id).order("placed_at", { ascending: false }),
    db.from("addresses").select("line1,line2,city,state,pincode,is_default").eq("user_id", id).order("is_default", { ascending: false }),
    db.from("returns").select("rma_number,status,reason,return_type,refund_amount,created_at,order_id,orders!inner(user_id)").eq("orders.user_id", id).order("created_at", { ascending: false }),
    db.from("order_items").select("product_id,quantity,unit_price,collection_name,size,orders!inner(user_id,payment_status)").eq("orders.user_id", id).in("orders.payment_status", PAID),
    db.from("wishlists").select("product_id,created_at,products(name,fragrance_family)").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("wholesale_customers").select("user_id").eq("user_id", id).maybeSingle(),
  ]);

  const orders = (ordersRes.data ?? []) as any[];
  const paid = orders.filter((o) => PAID.includes(o.payment_status));
  const ltv = Math.round(paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0));
  const aov = paid.length ? Math.round(ltv / paid.length) : 0;
  const lastOrderAt = paid.length ? paid[0].placed_at : null; // orders are desc
  const highestOrder = paid.reduce((m, o) => Math.max(m, Number(o.total_amount ?? 0)), 0);
  const returnsData = (retRes.data ?? []) as any[];
  const refundTotal = Math.round(orders.reduce((s, o) => s + Number(o.refund_amount ?? 0), 0));
  const replacementCount = returnsData.filter((r) => r.return_type === "replacement").length;
  const failedPayments = orders.filter((o) => o.payment_status === "failed").length;
  const rtoCount = orders.filter((o) => o.status === "rto" || o.ndr_status === "rto").length;
  const fraudFlag = orders.some((o) => o.fraud_review && !["none", "cleared"].includes(o.fraud_review));
  const tagsArr = Array.isArray(u.tags) ? u.tags : [];
  const wholesale = Boolean(wsRes.data) || tagsArr.map((t: string) => t.toLowerCase()).includes("wholesale");
  const segment = segmentOf(paid.length, ltv);
  const health = customerHealth(lastOrderAt, paid.length);

  const flags: { key: string; label: string; tone: string }[] = [];
  if (segment === "vip") flags.push({ key: "vip", label: "VIP", tone: "gold" });
  if (wholesale) flags.push({ key: "wholesale", label: "Wholesale", tone: "paid" });
  if (fraudFlag) flags.push({ key: "fraud", label: "Fraud Review", tone: "over" });
  if (tagsArr.map((t: string) => t.toLowerCase()).includes("watch")) flags.push({ key: "watch", label: "Watch", tone: "warn" });

  // Per-channel marketing consent (display only). Only email consent is actually stored today; the
  // rest are surfaced as "not tracked" so the panel is future-proof without implying false state.
  const consent: { channel: string; state: "in" | "out" | "unknown" }[] = [
    { channel: "Email", state: u.marketing_consent ? "in" : "out" },
    { channel: "SMS", state: "unknown" },
    { channel: "WhatsApp", state: "unknown" },
    { channel: "Push", state: "unknown" },
  ];

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
    notes: u.admin_notes ?? null, tags: tagsArr, segment,
    orders: orders.map((o) => ({ orderNumber: o.order_number, status: o.status, total: Number(o.total_amount), placedAt: o.placed_at })),
    addresses: (addrRes.data ?? []).map((a: any) => ({ line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: Boolean(a.is_default) })),
    returns: returnsData.map((r: any) => ({ rma: r.rma_number, status: r.status, reason: r.reason, createdAt: r.created_at })),
    ltv, aov, orderCount: paid.length,
    createdAt: u.created_at, phoneDigits: u.phone ? String(u.phone).replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10})$/, "91$1") : null,
    health, lastOrderAt, highestOrder: Math.round(highestOrder),
    totalReturns: returnsData.length, refundTotal, replacementCount, failedPayments, rtoCount, fraudFlag, wholesale,
    flags, consent,
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

/** The customer's paid + unpaid order ids (for scoping their commerce activity). */
async function customerOrderIds(db: any, id: string): Promise<string[]> {
  const { data } = await db.from("orders").select("id").eq("user_id", id);
  return (data ?? []).map((o: any) => o.id);
}

/**
 * Customer commerce timeline (review section 5) — the audit stream across ALL the customer's orders
 * (orders / payments / shipments / deliveries / returns / refunds / internal notes), newest-last for
 * the shared Timeline. Reuses the same audit_events table + Timeline component as every other module;
 * staff names resolved. Account activity (login / profile) stays a separate section.
 */
export async function getCustomerTimeline(id: string): Promise<AuditEvent[]> {
  try {
    const db = createAdminClient() as any;
    const orderIds = await customerOrderIds(db, id);
    if (!orderIds.length) return [];
    const { data } = await db.from("audit_events").select("*").in("order_id", orderIds).order("created_at", { ascending: true }).limit(500);
    const events = (data ?? []) as AuditEvent[];
    const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
    if (actorIds.length) {
      const { data: us } = await db.from("users").select("id,full_name").in("id", actorIds);
      const names = new Map<string, string>();
      for (const u of us ?? []) names.set(u.id, u.full_name ?? "");
      for (const e of events) e.actorName = e.actor_id ? names.get(e.actor_id) ?? null : null;
    }
    return events;
  } catch { return []; }
}

/** The customer's email/notification history (review section 8) — the notification log across all
 *  their orders, newest first. Reuses the existing notifications table (no new system). */
export async function getCustomerEmailHistory(id: string): Promise<Array<{ event: string; channel: string; status: string; created_at: string }>> {
  try {
    const db = createAdminClient() as any;
    const orderIds = await customerOrderIds(db, id);
    if (!orderIds.length) return [];
    const { data } = await db.from("notification_dispatches").select("event,channel,status,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(100);
    return (data ?? []) as any[];
  } catch { return []; }
}
