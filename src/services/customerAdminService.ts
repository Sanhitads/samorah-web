/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CRM / Customer 360 (Phase 3). A customer's full picture — profile, orders,
 * addresses, returns, lifetime value, notes/tags, marketing consent — assembled
 * from data that already exists (users · orders · addresses · returns). Segment
 * (New/Repeat/VIP) is derived from order stats.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

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
}

export async function getCustomer360(id: string): Promise<Customer360 | null> {
  const db = createAdminClient() as any;
  const { data: u } = await db.from("users").select("*").eq("id", id).maybeSingle();
  if (!u) return null;

  const [ordersRes, addrRes, retRes] = await Promise.all([
    db.from("orders").select("id,order_number,status,total_amount,payment_status,placed_at").eq("user_id", id).order("placed_at", { ascending: false }),
    db.from("addresses").select("line1,line2,city,state,pincode,is_default").eq("user_id", id).order("is_default", { ascending: false }),
    db.from("returns").select("rma_number,status,reason,created_at,order_id,orders!inner(user_id)").eq("orders.user_id", id).order("created_at", { ascending: false }),
  ]);

  const orders = (ordersRes.data ?? []) as any[];
  const paid = orders.filter((o) => PAID.includes(o.payment_status));
  const ltv = Math.round(paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0));
  const aov = paid.length ? Math.round(ltv / paid.length) : 0;

  return {
    id: u.id, name: u.full_name ?? u.email, email: u.email, phone: u.phone,
    marketingConsent: Boolean(u.marketing_consent), loyaltyPoints: Number(u.loyalty_points ?? 0), loyaltyTier: u.loyalty_tier, birthday: u.birthday,
    notes: u.admin_notes ?? null, tags: Array.isArray(u.tags) ? u.tags : [], segment: segmentOf(paid.length, ltv),
    orders: orders.map((o) => ({ orderNumber: o.order_number, status: o.status, total: Number(o.total_amount), placedAt: o.placed_at })),
    addresses: (addrRes.data ?? []).map((a: any) => ({ line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: Boolean(a.is_default) })),
    returns: (retRes.data ?? []).map((r: any) => ({ rma: r.rma_number, status: r.status, reason: r.reason, createdAt: r.created_at })),
    ltv, aov, orderCount: paid.length,
  };
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
