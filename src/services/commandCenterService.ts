/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Command Center (Dashboard v3) — the aggregations behind the admin operational
 * command center. Everything DERIVED — no new tables.
 *
 * ARCHITECTURE (review point 19): exposed as DOMAIN-SPECIFIC readers —
 * getRevenue · getInventory · getCustomers · getOperations · getMarketing ·
 * getCashflow · getIntegrations · getSeasonal — each self-contained and reusable
 * on its own (mobile app, notification workers, API endpoints, the future AI
 * assistant). `getCommandCenter()` is the aggregation layer that runs them in
 * parallel and then DERIVES the cross-domain views (alerts, work queue, business
 * health) as pure functions over the slices. Split the reads, keep the aggregate.
 *
 * Honestly NOT sourced yet (surfaced on the page as "needs integration", never
 * faked): abandoned carts, email-open rate, visitor conversion, Razorpay
 * settlement dates, exact courier-pickup times.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardStats } from "@/services/orderAdminService";
import { getReorderList } from "@/services/packagingService";

const PAID = ["paid", "partially_refunded", "refunded"];
const VIP_LTV = 15000;
const DISPATCH_SLA_HOURS = 24; // target: confirmed → dispatched
const r0 = (n: number) => Math.round(n);
const pct = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const db = () => createAdminClient() as any;

// ── Types ────────────────────────────────────────────────────────────────────
export interface RevenueSlice {
  trend: { today: number; yesterday: number; last7: number; last30: number; prev7: number; prev30: number; delta7: number | null; delta30: number | null; deltaDay: number | null; spark: number[] };
  breakdown: { gross: number; shipping: number; tax: number; refunds: number; net: number };
}
export interface InventorySlice {
  critical: { id: string; name: string; stock: number; daysLeft: number | null }[];
  criticalCount: number; warningCount: number; healthyCount: number;
}
export interface CustomersSlice { new30: number; returning30: number; vip: number; active30: number; firstTimeBuyers: number; repeatBuyers: number; total: number }
export interface OperationsSlice {
  returnsQueue: { open: number; toQc: number; items: { id: string; rma: string; status: string }[] };
  shipmentsAwaitingPickup: number;
  avgFulfillmentHours: number | null;
  dispatchSlaTargetHours: number;
}
export interface MarketingSlice { topCoupon: { code: string; redemptions: number; discount: number } | null; newsletter: { active: number; new7: number; new30: number } }
export interface CashflowSlice { received30: number; pendingCod: number; refunds30: number }
export interface IntegrationsSlice { items: { key: string; label: string; ok: boolean; note: string }[]; connected: number; total: number }
export interface SeasonalSlice { next: { name: string; date: string; daysUntil: number } | null; homepageDraftUnpublished: boolean }
export interface DraftsSlice { count: number; keys: string[] }
export interface FounderSlice { repeatRate: number; ltv: number; refundRate: number; avgFulfillmentHours: number | null }

export type Severity = "critical" | "warning" | "info";
export interface Alert { severity: Severity; title: string; detail: string; href: string; action: string }
export type Urgency = "overdue" | "today" | "later";
export interface WorkItem { label: string; href: string; count: number; urgency: Urgency }
export interface BusinessHealth { status: "healthy" | "attention"; reasons: string[] }

// ── Shared small loaders ───────────────────────────────────────────────────────
async function loadPaidOrders(sinceIso: string, cols: string) {
  const { data } = await db().from("orders").select(cols).in("payment_status", PAID).gte("placed_at", sinceIso);
  return (data ?? []) as any[];
}

/** confirmed → dispatched mean hours (the true fulfillment cycle). Shared by ops + founder. */
async function avgFulfillmentHours(): Promise<number | null> {
  const { data } = await db().from("audit_events")
    .select("order_id,event,created_at").in("event", ["order.confirmed", "shipment.dispatched"])
    .order("created_at", { ascending: false }).limit(2000);
  const confirmed = new Map<string, number>();
  const spans: number[] = [];
  for (const e of [...((data ?? []) as any[])].reverse()) {
    if (e.event === "order.confirmed") confirmed.set(e.order_id, new Date(e.created_at).getTime());
    else if (e.event === "shipment.dispatched" && confirmed.has(e.order_id)) {
      spans.push((new Date(e.created_at).getTime() - (confirmed.get(e.order_id) as number)) / 3.6e6);
      confirmed.delete(e.order_id);
    }
  }
  if (!spans.length) return null;
  return Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10;
}

// ── Domain readers (each reusable standalone) ──────────────────────────────────

/** Revenue trend (today/yesterday/7d/30d + period-over-period) and money breakdown. */
export async function getRevenue(): Promise<RevenueSlice> {
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday.getTime() - 86400000);
  const cut7 = now - 7 * 86400000, cut30 = now - 30 * 86400000, cut60 = now - 60 * 86400000, cut14 = now - 14 * 86400000;
  const orders = await loadPaidOrders(new Date(cut60).toISOString(),
    "total_amount,shipping_amount,cgst_amount,sgst_amount,igst_amount,refund_amount,placed_at");

  let today = 0, yesterday = 0, last7 = 0, prev7 = 0, last30 = 0, prev30 = 0, shipping = 0, tax = 0, refunds = 0;
  const spark = new Map<string, number>();
  for (let i = 13; i >= 0; i--) spark.set(dayKey(new Date(now - i * 86400000)), 0);
  for (const o of orders) {
    const amt = Number(o.total_amount ?? 0);
    const t = new Date(o.placed_at).getTime();
    if (t >= cut30) { last30 += amt; shipping += Number(o.shipping_amount ?? 0); tax += Number(o.cgst_amount ?? 0) + Number(o.sgst_amount ?? 0) + Number(o.igst_amount ?? 0); refunds += Number(o.refund_amount ?? 0); }
    else if (t >= cut60) prev30 += amt;
    if (t >= cut7) last7 += amt; else if (t >= cut7 - 7 * 86400000) prev7 += amt;
    if (t >= startToday.getTime()) today += amt; else if (t >= startYesterday.getTime()) yesterday += amt;
    if (t >= cut14) { const k = dayKey(new Date(t)); if (spark.has(k)) spark.set(k, (spark.get(k) ?? 0) + amt); }
  }
  return {
    trend: { today: r0(today), yesterday: r0(yesterday), last7: r0(last7), last30: r0(last30), prev7: r0(prev7), prev30: r0(prev30), delta7: pct(last7, prev7), delta30: pct(last30, prev30), deltaDay: pct(today, yesterday), spark: [...spark.values()].map(r0) },
    breakdown: { gross: r0(last30), shipping: r0(shipping), tax: r0(tax), refunds: r0(refunds), net: r0(last30 - tax - refunds) },
  };
}

/** Inventory buckets + estimated days-left via 30-day sales velocity (review point 4). */
export async function getInventory(): Promise<InventorySlice> {
  const cut30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [variantsRes, salesRes] = await Promise.all([
    db().from("variants").select("id,stock,low_stock_threshold,products(name)").eq("is_active", true),
    db().from("order_items").select("variant_id,quantity,orders!inner(payment_status,placed_at)").gte("orders.placed_at", cut30).in("orders.payment_status", PAID).limit(5000),
  ]);
  // units sold per variant over 30d → daily velocity
  const sold = new Map<string, number>();
  for (const it of (salesRes.data ?? []) as any[]) if (it.variant_id) sold.set(it.variant_id, (sold.get(it.variant_id) ?? 0) + Number(it.quantity ?? 0));

  const critical: InventorySlice["critical"] = [];
  let warningCount = 0, healthyCount = 0;
  for (const v of (variantsRes.data ?? []) as any[]) {
    const stock = Number(v.stock ?? 0), thr = Number(v.low_stock_threshold ?? 0);
    const velocity = (sold.get(v.id) ?? 0) / 30; // units/day
    const daysLeft = velocity > 0 ? Math.floor(stock / velocity) : null;
    if (stock <= 0 || stock <= Math.floor(thr / 2)) critical.push({ id: v.id, name: v.products?.name ?? "Variant", stock, daysLeft });
    else if (stock <= thr) warningCount++;
    else healthyCount++;
  }
  // rank critical: soonest to run out first (nulls last), then lowest stock
  critical.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.stock - b.stock);
  return { critical: critical.slice(0, 6), criticalCount: critical.length, warningCount, healthyCount };
}

/** Customer segments — window (new/returning/active) + lifetime (first-time/repeat/VIP). */
export async function getCustomers(): Promise<CustomersSlice> {
  const { data } = await db().from("orders").select("user_id,email,total_amount,placed_at").in("payment_status", PAID);
  const cut30 = Date.now() - 30 * 86400000;
  const byCust = new Map<string, { orders: number; ltv: number; firstAt: number; lastAt: number }>();
  for (const o of (data ?? []) as any[]) {
    const k = o.user_id || o.email; if (!k) continue;
    const at = new Date(o.placed_at).getTime();
    const c = byCust.get(k) ?? { orders: 0, ltv: 0, firstAt: at, lastAt: at };
    c.orders++; c.ltv += Number(o.total_amount ?? 0); c.firstAt = Math.min(c.firstAt, at); c.lastAt = Math.max(c.lastAt, at);
    byCust.set(k, c);
  }
  let new30 = 0, returning30 = 0, active30 = 0, vip = 0, firstTimeBuyers = 0, repeatBuyers = 0;
  for (const c of byCust.values()) {
    if (c.orders >= 2) repeatBuyers++; else firstTimeBuyers++;
    if (c.ltv >= VIP_LTV || c.orders >= 5) vip++;
    if (c.lastAt >= cut30) { active30++; if (c.firstAt >= cut30) new30++; else returning30++; }
  }
  return { new30, returning30, vip, active30, firstTimeBuyers, repeatBuyers, total: byCust.size };
}

/** Operational queue depth + fulfillment cycle time. */
export async function getOperations(): Promise<OperationsSlice> {
  const [returnsRes, shipRes, avgHrs] = await Promise.all([
    db().from("returns").select("id,rma_number,status").in("status", ["requested", "approved", "pickup_scheduled", "received", "qc"]).order("created_at", { ascending: true }).limit(50),
    db().from("shipments").select("id", { count: "exact", head: true }).in("status", ["shipment_created", "courier_assigned"]),
    avgFulfillmentHours(),
  ]);
  const rows = (returnsRes.data ?? []) as any[];
  return {
    returnsQueue: {
      open: rows.length,
      toQc: rows.filter((r) => ["received", "qc"].includes(r.status)).length,
      items: rows.slice(0, 6).map((r) => ({ id: r.id, rma: r.rma_number ?? r.id.slice(0, 8), status: r.status })),
    },
    shipmentsAwaitingPickup: (shipRes as { count: number | null }).count ?? 0,
    avgFulfillmentHours: avgHrs,
    dispatchSlaTargetHours: DISPATCH_SLA_HOURS,
  };
}

/** Marketing snapshot — top coupon (30d) + newsletter subscribers (review point 7). */
export async function getMarketing(): Promise<MarketingSlice> {
  const cut30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const cut7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const [orders, nlActive, nlNew7, nlNew30] = await Promise.all([
    loadPaidOrders(cut30, "coupon_code,discount_amount"),
    db().from("newsletter").select("id", { count: "exact", head: true }).eq("is_active", true),
    db().from("newsletter").select("id", { count: "exact", head: true }).eq("is_active", true).gte("subscribed_at", cut7),
    db().from("newsletter").select("id", { count: "exact", head: true }).eq("is_active", true).gte("subscribed_at", cut30),
  ]);
  const coup = new Map<string, { redemptions: number; discount: number }>();
  for (const o of orders) { if (!o.coupon_code) continue; const c = coup.get(o.coupon_code) ?? { redemptions: 0, discount: 0 }; c.redemptions++; c.discount += Number(o.discount_amount ?? 0); coup.set(o.coupon_code, c); }
  let topCoupon: MarketingSlice["topCoupon"] = null;
  for (const [code, v] of coup) if (!topCoupon || v.redemptions > topCoupon.redemptions) topCoupon = { code, redemptions: v.redemptions, discount: r0(v.discount) };
  const cnt = (r: any) => (r as { count: number | null }).count ?? 0;
  return { topCoupon, newsletter: { active: cnt(nlActive), new7: cnt(nlNew7), new30: cnt(nlNew30) } };
}

/** Cash flow — received / COD-pending / refunds (30d). */
export async function getCashflow(): Promise<CashflowSlice> {
  const cut30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [paid, cod] = await Promise.all([
    loadPaidOrders(cut30, "total_amount,refund_amount"),
    db().from("orders").select("total_amount").eq("is_cod", true).in("status", ["confirmed", "processing", "packed", "shipped"]),
  ]);
  const received30 = paid.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const refunds30 = paid.reduce((s, o) => s + Number(o.refund_amount ?? 0), 0);
  const pendingCod = ((cod.data ?? []) as any[]).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  return { received30: r0(received30), pendingCod: r0(pendingCod), refunds30: r0(refunds30) };
}

/** Integration status from configured credentials (review point 17). Honest "configured"
 *  signal — env present = wired. A live ping is a heavier future upgrade. */
export function getIntegrations(): IntegrationsSlice {
  const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);
  const anyOf = (...keys: string[]) => keys.some((k) => !!process.env[k]);
  const items = [
    { key: "ga4", label: "GA4", ok: anyOf("NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_GA_ID"), note: has("GA4_API_SECRET") ? "Analytics + server events" : "Analytics" },
    { key: "gtm", label: "Tag Manager", ok: has("NEXT_PUBLIC_GTM_ID"), note: "Tag Manager" },
    { key: "clarity", label: "Clarity", ok: has("NEXT_PUBLIC_CLARITY_ID"), note: has("CLARITY_API_TOKEN") ? "Heatmaps + metrics API" : "Heatmaps" },
    { key: "razorpay", label: "Razorpay", ok: has("NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"), note: "Payments" },
    { key: "shiprocket", label: "Shiprocket", ok: process.env.SHIPPING_PROVIDER === "shiprocket", note: "Logistics" },
    { key: "resend", label: "Resend", ok: has("RESEND_API_KEY"), note: "Email" },
    { key: "cloudinary", label: "Cloudinary", ok: has("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY"), note: "Media CDN" },
  ];
  return { items, connected: items.filter((i) => i.ok).length, total: items.length };
}

/** Seasonal campaign countdown (review point 18). Curated India retail calendar in code —
 *  no external data. Edit SEASONAL_MOMENTS as festival dates are confirmed each year. */
const SEASONAL_MOMENTS: { name: string; date: string }[] = [
  { name: "Raksha Bandhan", date: "2026-08-28" },
  { name: "Diwali", date: "2026-11-08" },
  { name: "Christmas", date: "2026-12-25" },
  { name: "New Year", date: "2027-01-01" },
  { name: "Valentine's Day", date: "2027-02-14" },
];
const SEASONAL_LOOKAHEAD_DAYS = 45;
export function getSeasonal(homepageDraftUnpublished: boolean): SeasonalSlice {
  const now = Date.now();
  const upcoming = SEASONAL_MOMENTS
    .map((m) => ({ ...m, daysUntil: Math.ceil((new Date(m.date + "T00:00:00").getTime() - now) / 86400000) }))
    .filter((m) => m.daysUntil >= 0 && m.daysUntil <= SEASONAL_LOOKAHEAD_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return { next: upcoming[0] ?? null, homepageDraftUnpublished };
}

async function getDrafts(): Promise<DraftsSlice> {
  const { data } = await db().from("composed_pages").select("page_key").eq("status", "draft");
  const keys = ((data ?? []) as any[]).map((d) => d.page_key);
  return { count: keys.length, keys };
}

// ── Pure derivations over the slices (reusable: notifications, AI, API) ─────────
export interface DeriveInput {
  inventory: InventorySlice; operations: OperationsSlice; drafts: DraftsSlice;
  stats: { readyForDispatch: number; onHold: number; refundsPending: number; awaitingFulfillment: number };
  failedPayments: number; pendingEmails: number; reorderCount: number; reviewsPending: number;
  oldestWaitingHours: number | null;
}

/** Alerts grouped by severity — Critical / Warning / Info (review point 2). */
export function buildAlerts(x: DeriveInput): Alert[] {
  const out: Alert[] = [];
  // 🔴 Critical — money at risk / negative or zero stock / SLA badly breached
  const outOfStock = x.inventory.critical.filter((c) => c.stock <= 0);
  for (const c of outOfStock.slice(0, 3)) out.push({ severity: "critical", title: c.name, detail: "Out of stock", href: "/admin/products", action: "Restock" });
  if (x.failedPayments > 0) out.push({ severity: "critical", title: `${x.failedPayments} failed payment${x.failedPayments === 1 ? "" : "s"}`, detail: "Last 30 days", href: "/admin/orders", action: "Review" });
  if (x.oldestWaitingHours != null && x.oldestWaitingHours >= 48) out.push({ severity: "critical", title: "Order waiting 48h+", detail: `Oldest ${Math.round(x.oldestWaitingHours)}h in queue`, href: "/admin/fulfillment", action: "Dispatch" });
  // 🟠 Warning — low stock, on-hold, QC backlog
  for (const c of x.inventory.critical.filter((c) => c.stock > 0).slice(0, 3)) out.push({ severity: "warning", title: c.name, detail: c.daysLeft != null ? `${c.stock} left · ~${c.daysLeft}d` : `Only ${c.stock} left`, href: "/admin/products", action: "View" });
  if (x.stats.onHold > 0) out.push({ severity: "warning", title: `${x.stats.onHold} order${x.stats.onHold === 1 ? "" : "s"} on hold`, detail: "Needs triage", href: "/admin/fulfillment", action: "Triage" });
  if (x.operations.returnsQueue.toQc > 0) out.push({ severity: "warning", title: `${x.operations.returnsQueue.toQc} return${x.operations.returnsQueue.toQc === 1 ? "" : "s"} awaiting QC`, detail: "In inspection queue", href: "/admin/returns", action: "Open" });
  if (x.reorderCount > 0) out.push({ severity: "warning", title: `${x.reorderCount} packaging item${x.reorderCount === 1 ? "" : "s"} low`, detail: "Below reorder level", href: "/admin/packaging", action: "Reorder" });
  // 🔵 Info — drafts, queued email, reviews
  for (const k of x.drafts.keys.slice(0, 3)) out.push({ severity: "info", title: `${k.replace(/[-_]/g, " ")} draft`, detail: "Unpublished changes", href: k === "homepage" ? "/admin/homepage" : "/admin/content", action: "Publish" });
  if (x.pendingEmails > 5) out.push({ severity: "info", title: `${x.pendingEmails} emails queued`, detail: "Awaiting send", href: "/admin/health", action: "Check" });
  if (x.reviewsPending > 0) out.push({ severity: "info", title: `${x.reviewsPending} review${x.reviewsPending === 1 ? "" : "s"} to moderate`, detail: "Pending approval", href: "/admin/content", action: "Review" });
  return out;
}

/** Work queue, auto-prioritized: 🔥 Overdue / ⚠ Today / Later (review point 11). */
export function buildWorkQueue(x: DeriveInput): WorkItem[] {
  const q: WorkItem[] = [];
  const overdue = x.oldestWaitingHours != null && x.oldestWaitingHours >= x.operations.dispatchSlaTargetHours;
  if (x.stats.readyForDispatch > 0) q.push({ label: `Dispatch ${x.stats.readyForDispatch} order${x.stats.readyForDispatch === 1 ? "" : "s"}`, href: "/admin/fulfillment", count: x.stats.readyForDispatch, urgency: overdue ? "overdue" : "today" });
  if (x.stats.onHold > 0) q.push({ label: `Resolve ${x.stats.onHold} on-hold order${x.stats.onHold === 1 ? "" : "s"}`, href: "/admin/fulfillment", count: x.stats.onHold, urgency: "overdue" });
  if (x.failedPayments > 0) q.push({ label: `Follow up ${x.failedPayments} failed payment${x.failedPayments === 1 ? "" : "s"}`, href: "/admin/orders", count: x.failedPayments, urgency: "today" });
  if (x.operations.returnsQueue.toQc > 0) q.push({ label: `Review ${x.operations.returnsQueue.toQc} return${x.operations.returnsQueue.toQc === 1 ? "" : "s"} in QC`, href: "/admin/returns", count: x.operations.returnsQueue.toQc, urgency: "today" });
  if (x.stats.refundsPending > 0) q.push({ label: `Process ${x.stats.refundsPending} refund${x.stats.refundsPending === 1 ? "" : "s"}`, href: "/admin/orders", count: x.stats.refundsPending, urgency: "today" });
  if (x.drafts.count > 0) q.push({ label: `Publish ${x.drafts.count} content draft${x.drafts.count === 1 ? "" : "s"}`, href: "/admin/content", count: x.drafts.count, urgency: "later" });
  if (x.reorderCount > 0) q.push({ label: `Reorder ${x.reorderCount} packaging item${x.reorderCount === 1 ? "" : "s"}`, href: "/admin/packaging", count: x.reorderCount, urgency: "later" });
  const rank: Record<Urgency, number> = { overdue: 0, today: 1, later: 2 };
  return q.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/** Business Health — one glance: Healthy or Attention Required (review point 16). */
export function buildBusinessHealth(x: DeriveInput): BusinessHealth {
  const reasons: string[] = [];
  if (x.inventory.criticalCount > 0) reasons.push(`${x.inventory.criticalCount} critical stock`);
  if (x.failedPayments > 0) reasons.push(`${x.failedPayments} failed payment${x.failedPayments === 1 ? "" : "s"}`);
  if (x.stats.readyForDispatch > 0 && x.oldestWaitingHours != null && x.oldestWaitingHours >= x.operations.dispatchSlaTargetHours) reasons.push("dispatch overdue");
  if (x.stats.onHold > 0) reasons.push(`${x.stats.onHold} on hold`);
  if (x.drafts.count > 0) reasons.push(`${x.drafts.count} unpublished draft${x.drafts.count === 1 ? "" : "s"}`);
  return { status: reasons.length ? "attention" : "healthy", reasons };
}

// ── Aggregation layer ──────────────────────────────────────────────────────────
export interface CommandCenter {
  revenue: RevenueSlice; inventory: InventorySlice; customers: CustomersSlice;
  operations: OperationsSlice; marketing: MarketingSlice; cashflow: CashflowSlice;
  integrations: IntegrationsSlice; seasonal: SeasonalSlice; drafts: DraftsSlice;
  founder: FounderSlice; alerts: Alert[]; workQueue: WorkItem[]; health: BusinessHealth;
}

/** The one call the dashboard makes: run every domain reader in parallel, then derive
 *  the cross-domain views. Reusable slices, single aggregate — review point 19. */
export async function getCommandCenter(): Promise<CommandCenter> {
  const [revenue, inventory, customers, operations, marketing, cashflow, drafts, stats, reorder, extras] = await Promise.all([
    getRevenue(), getInventory(), getCustomers(), getOperations(), getMarketing(), getCashflow(), getDrafts(),
    getDashboardStats(), getReorderList(), loadExtras(),
  ]);
  const integrations = getIntegrations();
  const seasonal = getSeasonal(drafts.keys.includes("homepage"));

  const input: DeriveInput = {
    inventory, operations, drafts,
    stats: { readyForDispatch: stats.readyForDispatch, onHold: stats.onHold, refundsPending: stats.refundsPending, awaitingFulfillment: stats.awaitingFulfillment },
    failedPayments: extras.failedPayments, pendingEmails: extras.pendingEmails, reorderCount: reorder.length,
    reviewsPending: extras.reviewsPending, oldestWaitingHours: extras.oldestWaitingHours,
  };

  const founder: FounderSlice = {
    repeatRate: customers.total ? Math.round((customers.repeatBuyers / customers.total) * 1000) / 10 : 0,
    ltv: extras.avgLtv,
    refundRate: extras.refundRate,
    avgFulfillmentHours: operations.avgFulfillmentHours,
  };

  return {
    revenue, inventory, customers, operations, marketing, cashflow, integrations, seasonal, drafts, founder,
    alerts: buildAlerts(input), workQueue: buildWorkQueue(input), health: buildBusinessHealth(input),
  };
}

/** Cross-cutting signals not owned by a single domain slice (kept in one small pass). */
async function loadExtras(): Promise<{ failedPayments: number; pendingEmails: number; reviewsPending: number; oldestWaitingHours: number | null; avgLtv: number; refundRate: number }> {
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const active = ["confirmed", "processing", "packed"];
  const [failed, emails, reviews, oldest, allPaid, refunded30] = await Promise.all([
    db().from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", monthAgo),
    db().from("fulfillment_jobs").select("id", { count: "exact", head: true }).in("job_type", ["email", "dispatch_email", "cancellation_email"]).eq("status", "queued"),
    db().from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("orders").select("placed_at").eq("payment_status", "paid").in("status", active).order("placed_at", { ascending: true }).limit(1),
    db().from("orders").select("total_amount").in("payment_status", PAID),
    db().from("orders").select("id", { count: "exact", head: true }).gt("refund_amount", 0).gte("placed_at", monthAgo),
  ]);
  const cnt = (r: any) => (r as { count: number | null }).count ?? 0;
  const oldestAt = ((oldest.data ?? []) as any[])[0]?.placed_at as string | undefined;
  const paidRows = (allPaid.data ?? []) as any[];
  const avgLtv = paidRows.length ? r0(paidRows.reduce((s, o) => s + Number(o.total_amount ?? 0), 0) / paidRows.length) : 0;
  // refund rate = refunded orders (30d) / paid orders (30d)
  const paid30 = await db().from("orders").select("id", { count: "exact", head: true }).in("payment_status", PAID).gte("placed_at", monthAgo);
  const refundRate = cnt(paid30) ? Math.round((cnt(refunded30) / cnt(paid30)) * 1000) / 10 : 0;
  return {
    failedPayments: cnt(failed), pendingEmails: cnt(emails), reviewsPending: cnt(reviews),
    oldestWaitingHours: oldestAt ? Math.round(((Date.now() - new Date(oldestAt).getTime()) / 3.6e6) * 10) / 10 : null,
    avgLtv, refundRate,
  };
}
