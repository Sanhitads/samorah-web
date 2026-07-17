/**
 * Read models for the Order Management admin (SLP principle 21's Orders module).
 * Distinct from the Fulfillment Board reader: this is the commercial view of an
 * order — money, payment state, refunds — not the warehouse workflow.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { sortColumn, rangeStart, type OrderSort } from "@/lib/admin/orderList";
import { mergeTags, removeTagsFrom, type BulkAction, type UndoRecord, type BulkUndo } from "@/lib/admin/orderBulk";
import { orderHealth, type HealthBadge } from "@/lib/admin/orderHealth";
import { getOpenIncidentOrderNumbers } from "@/services/incidentService";

export interface OrderOverviewRow {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  status: string; // order_status
  paymentStatus: string; // payment_status
  paymentMethod: string | null; // captured instrument (upi/card/…); shown ALONGSIDE status
  isCod: boolean;
  isGift: boolean;
  hasGstin: boolean; // B2B tax invoice requested
  priority: string; // normal | high | urgent | vip
  courierName: string | null;
  assignedTo: string | null; // users.id
  assignedName: string | null; // resolved display name (null when unassigned)
  tags: string[];
  fraudReview: string; // Phase 2 flag
  wholesale: string; // Phase 2 flag
  incidentNumber: string | null; // manual incident link
  hasIncident: boolean; // open incident (soft link or manual)
  health: HealthBadge; // Phase 3 computed indicator
  total: number;
  refundAmount: number;
  latestRefundStatus: string | null; // ledger sub-state (review point 4)
  hasPayment: boolean; // a captured Razorpay payment exists (gateway refund possible)
  placedAt: string;
}

export interface OrderFilter {
  search?: string; // order number or email
  status?: string;
  payment?: string; // payment_status
  paymentMethod?: string; // instrument (upi/card/netbanking/wallet/cod)
  priority?: string;
  courier?: string;
  assignedTo?: string; // users.id
  tag?: string; // one ops_tag (e.g. "Wholesale")
  gift?: boolean;
  fraudReview?: string; // Phase 2 flag filter (specific state, or "any")
  wholesale?: string; // Phase 2 flag filter (specific state, or "any")
  hasIncident?: boolean; // only orders with an open incident
  range?: string; // today | 7d | 30d (created_at lower bound)
  awaiting?: boolean; // paid & pre-ship — the "Pending Shipment" view
  refundQueue?: boolean; // has an open (initiated/processing) refund
  needsAttention?: boolean; // on_hold | failed payment | NDR
  orderNumbers?: string[]; // explicit set (export-selected)
  sort?: OrderSort;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Pre-resolve order ids with an OPEN refund (for the Refund Queue view). Returns null when the
 *  filter isn't active, or [] when active-but-empty (caller must then match nothing). */
async function resolveRefundQueueIds(loose: LooseClient, f: OrderFilter): Promise<string[] | null> {
  if (!f.refundQueue) return null;
  const { data } = await loose.from("refunds").select("order_id").in("status", ["initiated", "processing"]);
  return [...new Set((data ?? []).map((r: { order_id: string }) => r.order_id))] as string[];
}

/** Apply every OrderFilter predicate to a PostgREST query. Shared by the list and the summary so
 *  the two can never drift — the numbers in the strip always describe exactly the rows below it.
 *  `incidentNumbers` (the open-incident order-number set) is resolved once by the caller. */
function applyOrderFilters(q: LooseClient, f: OrderFilter, refundQueueIds: string[] | null, incidentNumbers: string[] | null = null): LooseClient {
  if (f.status) q = q.eq("status", f.status);
  if (f.payment) q = q.eq("payment_status", f.payment);
  if (f.paymentMethod) q = f.paymentMethod === "cod" ? q.eq("is_cod", true) : q.eq("payment_method", f.paymentMethod);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.courier) q = q.eq("courier_name", f.courier);
  if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);
  if (f.gift) q = q.eq("is_gift", true);
  if (f.tag) q = q.contains("ops_tags", [f.tag]);
  if (f.fraudReview) q = f.fraudReview === "any" ? q.neq("fraud_review", "none") : q.eq("fraud_review", f.fraudReview);
  if (f.wholesale) q = f.wholesale === "any" ? q.neq("wholesale", "none") : q.eq("wholesale", f.wholesale);
  if (f.hasIncident) {
    // An open incident = a manual link (incident_number) OR a soft link (order in the resolved set).
    const nums = (incidentNumbers ?? []).filter((n) => /^[\w-]+$/.test(n));
    q = nums.length ? q.or(`incident_number.not.is.null,order_number.in.(${nums.join(",")})`) : q.not("incident_number", "is", null);
  }
  if (f.awaiting) q = q.eq("payment_status", "paid").in("status", ["confirmed", "processing", "packed"]);
  if (f.needsAttention) q = q.or("fulfillment_status.eq.on_hold,payment_status.eq.failed,ndr_status.not.is.null");
  if (f.orderNumbers?.length) q = q.in("order_number", f.orderNumbers.slice(0, 5000));
  // Empty id set → match nothing (an impossible UUID), never `in.()` which PostgREST rejects.
  if (refundQueueIds) q = q.in("id", refundQueueIds.length ? refundQueueIds : ["00000000-0000-0000-0000-000000000000"]);
  const start = rangeStart(f.range);
  if (start) q = q.gte("created_at", start);
  if (f.search) {
    const s = f.search.trim().replace(/[%,]/g, "");
    q = q.or(`order_number.ilike.%${s}%,email.ilike.%${s}%,ship_full_name.ilike.%${s}%`);
  }
  return q;
}
/** High-value threshold for the "High Value" badge (rupees). */
export const HIGH_VALUE_THRESHOLD = 5000;

export interface DashboardStats {
  awaitingFulfillment: number; // paid, not terminal, not yet shipped
  onHold: number;
  readyForDispatch: number;
  shippedActive: number; // shipped but not delivered
  refundsPending: number; // refunds not yet processed/failed
  totalOrders: number;
}

/** Headline counts for the admin Dashboard (principle 21's landing module). Uses
 *  PostgREST head+exact counts, so no rows travel — just the numbers. */
export async function getDashboardStats(): Promise<DashboardStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const active = ["confirmed", "processing", "packed"]; // paid but pre-ship, non-terminal
  const head = (q: unknown) => (q as { count: number | null }).count ?? 0;

  const [awaiting, onHold, ready, shippedActive, total, refundsPending] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid").in("status", active),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "on_hold"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "ready_for_dispatch"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "shipped"),
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("refunds").select("id", { count: "exact", head: true }).in("status", ["initiated", "processing"]),
  ]);

  return {
    awaitingFulfillment: head(awaiting),
    onHold: head(onHold),
    readyForDispatch: head(ready),
    shippedActive: head(shippedActive),
    totalOrders: head(total),
    refundsPending: head(refundsPending),
  };
}

export interface OperationalMetrics {
  avgPickMinutes: number | null;
  avgPackMinutes: number | null;
  oldestWaitingHours: number | null;
  ordersWaiting: number;
  ordersOnHold: number;
  refundQueue: number;
}

/** Mean minutes between a start event and its matching end event, per order. */
function meanDuration(events: { order_id: string; event: string; created_at: string }[], startEv: string, endEv: string): number | null {
  const starts = new Map<string, number>();
  const durations: number[] = [];
  // events arrive newest-first; walk oldest-first so start precedes end.
  for (const e of [...events].reverse()) {
    if (e.event === startEv) starts.set(e.order_id, new Date(e.created_at).getTime());
    else if (e.event === endEv && starts.has(e.order_id)) {
      durations.push((new Date(e.created_at).getTime() - (starts.get(e.order_id) as number)) / 60000);
      starts.delete(e.order_id);
    }
  }
  if (!durations.length) return null;
  return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
}

/** Warehouse timing + queue depth for the Dashboard (review point 12). */
export async function getOperationalMetrics(): Promise<OperationalMetrics> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const active = ["confirmed", "processing", "packed"];

  const { data: events } = await db
    .from("audit_events")
    .select("order_id,event,created_at")
    .in("event", ["fulfillment.picking", "fulfillment.picked", "fulfillment.packing", "fulfillment.packed"])
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: oldest } = await db
    .from("orders")
    .select("placed_at")
    .eq("payment_status", "paid")
    .in("status", active)
    .order("placed_at", { ascending: true })
    .limit(1);

  const [waiting, onHold, refundQueue] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid").in("status", active),
    db.from("orders").select("id", { count: "exact", head: true }).eq("fulfillment_status", "on_hold"),
    db.from("refunds").select("id", { count: "exact", head: true }).in("status", ["initiated", "processing"]),
  ]);

  const ev = (events ?? []) as { order_id: string; event: string; created_at: string }[];
  const oldestAt = (oldest ?? [])[0]?.placed_at as string | undefined;

  return {
    avgPickMinutes: meanDuration(ev, "fulfillment.picking", "fulfillment.picked"),
    avgPackMinutes: meanDuration(ev, "fulfillment.packing", "fulfillment.packed"),
    oldestWaitingHours: oldestAt ? Math.round(((Date.now() - new Date(oldestAt).getTime()) / 3.6e6) * 10) / 10 : null,
    ordersWaiting: (waiting as { count: number | null }).count ?? 0,
    ordersOnHold: (onHold as { count: number | null }).count ?? 0,
    refundQueue: (refundQueue as { count: number | null }).count ?? 0,
  };
}

/** Recent orders, filtered + searched + sorted, for the management list. */
export async function getOrdersOverview(filter: OrderFilter | number = {}): Promise<OrderOverviewRow[]> {
  const f: OrderFilter = typeof filter === "number" ? { limit: filter } : filter;
  // Loose: refund_amount / refunds / board columns aren't in the generated types yet.
  const loose = createAdminClient() as LooseClient;
  const refundQueueIds = await resolveRefundQueueIds(loose, f);
  const incidentFilterNumbers = f.hasIncident ? [...(await getOpenIncidentOrderNumbers())] : null;
  const { column, ascending } = sortColumn(f.sort);
  let q = loose
    .from("orders")
    .select(
      "id,order_number,email,ship_full_name,status,payment_status,payment_method,is_cod,is_gift,buyer_gstin,priority,courier_name,assigned_to,ops_tags,fraud_review,wholesale,incident_number,ndr_status,fulfillment_status,total_amount,refund_amount,razorpay_payment_id,created_at",
    )
    .order(column, { ascending })
    .limit(f.limit ?? 100);
  q = applyOrderFilters(q, f, refundQueueIds, incidentFilterNumbers);
  const { data, error } = await q;
  if (error) throw error;
  const orders = (data ?? []) as { id: string; assigned_to: string | null; order_number: string }[];

  // Open-incident set for THIS page (soft link) — one batch query, never per-row.
  const softIncident = await getOpenIncidentOrderNumbers(orders.map((o) => o.order_number));

  // Latest non-failed refund status per order, in one query (point 4).
  const ids = orders.map((o) => o.id);
  const refundStatus = new Map<string, string>();
  if (ids.length) {
    const { data: refunds } = await loose
      .from("refunds")
      .select("order_id,status,created_at")
      .in("order_id", ids)
      .neq("status", "failed")
      .order("created_at", { ascending: false });
    for (const r of refunds ?? []) if (!refundStatus.has(r.order_id)) refundStatus.set(r.order_id, r.status);
  }

  // Resolve assignee display names in one query (id → name), for the "Assigned" column.
  const assignedIds = [...new Set(orders.map((o) => o.assigned_to).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (assignedIds.length) {
    const { data: staff } = await loose.from("users").select("id,full_name,email").in("id", assignedIds);
    for (const u of staff ?? []) nameById.set(u.id, u.full_name || u.email);
  }

  return orders.map((o) => {
    const r = o as unknown as {
      id: string;
      order_number: string;
      email: string;
      ship_full_name: string | null;
      status: string;
      payment_status: string;
      payment_method: string | null;
      is_cod: boolean;
      is_gift: boolean;
      buyer_gstin: string | null;
      priority: string | null;
      courier_name: string | null;
      assigned_to: string | null;
      ops_tags: string[] | null;
      fraud_review: string | null;
      wholesale: string | null;
      incident_number: string | null;
      ndr_status: string | null;
      fulfillment_status: string | null;
      total_amount: number;
      refund_amount: number | null;
      razorpay_payment_id: string | null;
      created_at: string;
    };
    const latestRefundStatus = refundStatus.get(r.id) ?? null;
    const hasIncident = Boolean(r.incident_number) || softIncident.has(r.order_number);
    const health = orderHealth({
      status: r.status,
      paymentStatus: r.payment_status,
      fraudReview: r.fraud_review,
      hasOpenIncident: hasIncident,
      refundPending: latestRefundStatus === "initiated" || latestRefundStatus === "processing",
      ndrStatus: r.ndr_status,
      fulfillmentStatus: r.fulfillment_status,
    });
    return {
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.ship_full_name ?? r.email,
      email: r.email,
      status: r.status,
      paymentStatus: r.payment_status,
      paymentMethod: r.payment_method ?? null,
      isCod: r.is_cod,
      isGift: Boolean(r.is_gift),
      hasGstin: Boolean(r.buyer_gstin),
      priority: r.priority ?? "normal",
      courierName: r.courier_name ?? null,
      assignedTo: r.assigned_to ?? null,
      assignedName: r.assigned_to ? nameById.get(r.assigned_to) ?? null : null,
      tags: Array.isArray(r.ops_tags) ? r.ops_tags : [],
      fraudReview: r.fraud_review ?? "none",
      wholesale: r.wholesale ?? "none",
      incidentNumber: r.incident_number ?? null,
      hasIncident,
      health,
      total: Number(r.total_amount),
      refundAmount: Number(r.refund_amount ?? 0),
      latestRefundStatus,
      hasPayment: Boolean(r.razorpay_payment_id),
      placedAt: r.created_at,
    };
  });
}

export interface OrdersSummary {
  count: number;
  revenue: number; // gross paid + partially-refunded totals (₹)
  pending: number; // status pending or payment pending
  refunds: number; // orders with any refund
  cancellations: number;
  capped: boolean; // true when the matching set exceeded the aggregation cap
}

/**
 * Headline numbers for the summary strip, computed over EXACTLY the current filter (same
 * `applyOrderFilters`), so the strip can never disagree with the rows. Aggregated in JS over a
 * bounded fetch of lightweight columns — correct and simple at a luxury brand's scale. If the set
 * ever exceeds the cap, `capped` is surfaced (shown as "2000+"); moving to a SQL aggregate RPC is
 * the documented next step, not silent under-counting.
 */
export async function getOrdersSummary(filter: OrderFilter = {}): Promise<OrdersSummary> {
  const loose = createAdminClient() as LooseClient;
  const refundQueueIds = await resolveRefundQueueIds(loose, filter);
  const incidentFilterNumbers = filter.hasIncident ? [...(await getOpenIncidentOrderNumbers())] : null;
  const CAP = 2000;
  let q = loose.from("orders").select("total_amount,status,payment_status,refund_amount").limit(CAP + 1);
  q = applyOrderFilters(q, filter, refundQueueIds, incidentFilterNumbers);
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as { total_amount: number; status: string; payment_status: string; refund_amount: number | null }[];
  const capped = all.length > CAP;
  const rows = capped ? all.slice(0, CAP) : all;

  let revenue = 0, pending = 0, refunds = 0, cancellations = 0;
  for (const r of rows) {
    if (r.payment_status === "paid" || r.payment_status === "partially_refunded") revenue += Number(r.total_amount);
    if (r.status === "pending" || r.payment_status === "pending") pending += 1;
    if (Number(r.refund_amount ?? 0) > 0) refunds += 1;
    if (r.status === "cancelled") cancellations += 1;
  }
  return { count: rows.length, revenue, pending, refunds, cancellations, capped };
}

export interface StaffOption { id: string; name: string; }
/** Staff who can be assigned an order (role ≥ editor). Used for the filter + assignee resolution. */
export async function getStaffOptions(): Promise<StaffOption[]> {
  const loose = createAdminClient() as LooseClient;
  const { data } = await loose
    .from("users")
    .select("id,full_name,email,role")
    .in("role", ["editor", "manager", "admin", "super_admin"])
    .order("full_name");
  return (data ?? []).map((u: { id: string; full_name: string | null; email: string }) => ({ id: u.id, name: u.full_name || u.email }));
}

/** Distinct courier names seen on orders, for the courier filter dropdown. */
export async function getCourierOptions(): Promise<string[]> {
  const loose = createAdminClient() as LooseClient;
  const { data } = await loose.from("orders").select("courier_name").not("courier_name", "is", null).limit(500);
  return [...new Set((data ?? []).map((o: { courier_name: string | null }) => o.courier_name).filter(Boolean) as string[])].sort();
}

// ── Safe bulk operations (Phase 1) ───────────────────────────────────────────
export interface BulkTarget { id: string; orderNumber: string; }

/** Resolve id+number pairs for an explicit selection (Select Current Page). */
export async function resolveTargetsByNumbers(orderNumbers: string[]): Promise<BulkTarget[]> {
  if (!orderNumbers.length) return [];
  const loose = createAdminClient() as LooseClient;
  const { data } = await loose.from("orders").select("id,order_number").in("order_number", orderNumbers.slice(0, 5000));
  return (data ?? []).map((r: { id: string; order_number: string }) => ({ id: r.id, orderNumber: r.order_number }));
}

/** Resolve id+number pairs for the whole current filter (Select All Filtered) — same
 *  applyOrderFilters as the list, capped, so the selection matches exactly what's shown. */
export async function resolveTargetsByFilter(filter: OrderFilter, cap = 2000): Promise<BulkTarget[]> {
  const loose = createAdminClient() as LooseClient;
  const refundQueueIds = await resolveRefundQueueIds(loose, filter);
  const incidentFilterNumbers = filter.hasIncident ? [...(await getOpenIncidentOrderNumbers())] : null;
  let q = loose.from("orders").select("id,order_number").limit(cap);
  q = applyOrderFilters(q, filter, refundQueueIds, incidentFilterNumbers);
  const { data } = await q;
  return (data ?? []).map((r: { id: string; order_number: string }) => ({ id: r.id, orderNumber: r.order_number }));
}

export interface BulkActionInput {
  action: BulkAction;
  targets: BulkTarget[];
  staffId?: string;
  priority?: string;
  tags?: string[];
  note?: string;
  fraudState?: string;
  wholesaleState?: string;
  incidentNumber?: string;
  restore?: UndoRecord[]; // action === "restore"
  actorId?: string;
}
export interface BulkActionResult {
  done: number;
  failed: { orderNumber: string; reason: string }[];
  undo?: BulkUndo; // present for reversible actions — feeds the client's Undo button
}

/**
 * Apply a NON-DESTRUCTIVE bulk action, one record at a time so a single bad row is SKIPPED, not
 * fatal to the batch (an explicit requirement). Reversible actions capture each order's prior value
 * into an undo descriptor. Current values are batch-read once up front (no per-row read); the writes
 * are per-row because each order's next value can differ (tags), and per-row isolation is what makes
 * "skip failures" possible. Every record writes an audit event → full history + timeline.
 */
export async function applyBulkAction(input: BulkActionInput): Promise<BulkActionResult> {
  const loose = createAdminClient() as LooseClient;
  const { action, targets, actorId } = input;
  const failed: { orderNumber: string; reason: string }[] = [];
  const undoRecords: UndoRecord[] = [];
  let done = 0;
  const now = () => new Date().toISOString();

  // One batch read of current values — for undo capture + audit previous_state (not needed for note).
  const prevById = new Map<string, { assigned_to: string | null; priority: string | null; ops_tags: string[]; fraud_review: string | null; wholesale: string | null; incident_number: string | null }>();
  const ids = targets.map((t) => t.id);
  if (ids.length && action !== "note") {
    const { data } = await loose.from("orders").select("id,assigned_to,priority,ops_tags,fraud_review,wholesale,incident_number").in("id", ids);
    for (const r of data ?? []) prevById.set(r.id, { assigned_to: r.assigned_to ?? null, priority: r.priority ?? null, ops_tags: Array.isArray(r.ops_tags) ? r.ops_tags : [], fraud_review: r.fraud_review ?? null, wholesale: r.wholesale ?? null, incident_number: r.incident_number ?? null });
  }

  for (const t of targets) {
    try {
      const prev = prevById.get(t.id);
      let patch: Record<string, unknown> | null = null;
      let undoPatch: Record<string, unknown> | null = null;
      let event = "order.updated";
      let notes = "";

      if (action === "assign") {
        patch = { assigned_to: input.staffId ?? null, updated_at: now() };
        undoPatch = { assigned_to: prev?.assigned_to ?? null };
        event = "order.assigned"; notes = `assigned via bulk`;
      } else if (action === "priority") {
        patch = { priority: input.priority, updated_at: now() };
        undoPatch = { priority: prev?.priority ?? "normal" };
        event = "order.priority_set"; notes = `priority → ${input.priority}`;
      } else if (action === "addTags") {
        patch = { ops_tags: mergeTags(prev?.ops_tags ?? [], input.tags ?? []), updated_at: now() };
        undoPatch = { ops_tags: prev?.ops_tags ?? [] };
        event = "order.tagged"; notes = `+ ${(input.tags ?? []).join(", ")}`;
      } else if (action === "removeTags") {
        patch = { ops_tags: removeTagsFrom(prev?.ops_tags ?? [], input.tags ?? []), updated_at: now() };
        undoPatch = { ops_tags: prev?.ops_tags ?? [] };
        event = "order.tagged"; notes = `− ${(input.tags ?? []).join(", ")}`;
      } else if (action === "note") {
        event = "order.note_added"; notes = input.note ?? ""; // audit-only; never clobbers ops_note
      } else if (action === "markFraud") {
        patch = { fraud_review: input.fraudState, updated_at: now() };
        undoPatch = { fraud_review: prev?.fraud_review ?? "none" };
        event = "order.fraud_review_set"; notes = `fraud review → ${input.fraudState}`;
      } else if (action === "markWholesale") {
        patch = { wholesale: input.wholesaleState, updated_at: now() };
        undoPatch = { wholesale: prev?.wholesale ?? "none" };
        event = "order.wholesale_set"; notes = `wholesale → ${input.wholesaleState}`;
      } else if (action === "linkIncident") {
        patch = { incident_number: input.incidentNumber, updated_at: now() };
        undoPatch = { incident_number: prev?.incident_number ?? null };
        event = "order.incident_linked"; notes = `linked ${input.incidentNumber}`;
      } else if (action === "restore") {
        const rec = (input.restore ?? []).find((r) => r.orderNumber === t.orderNumber);
        if (!rec) { failed.push({ orderNumber: t.orderNumber, reason: "no undo record" }); continue; }
        patch = { ...rec.patch, updated_at: now() };
        event = "order.bulk_undo"; notes = "reverted";
      }

      if (patch) {
        const { error } = await loose.from("orders").update(patch).eq("id", t.id);
        if (error) { failed.push({ orderNumber: t.orderNumber, reason: error.message }); continue; }
      }
      await logEvent({ orderId: t.id, entityType: "order", entityId: t.id, event, actorType: actorId ? "staff" : "system", actorId, notes, metadata: { bulk: true, action } });
      if (undoPatch) undoRecords.push({ orderNumber: t.orderNumber, patch: undoPatch });
      done++;
    } catch (e) {
      failed.push({ orderNumber: t.orderNumber, reason: e instanceof Error ? e.message : "failed" });
    }
  }

  return { done, failed, undo: undoRecords.length ? { action, records: undoRecords } : undefined };
}

// ── Order annotations + resend (Phase 2 admin enhancements) ──────────────────
/** Internal note on an order (ops_note is shared with the board). */
export async function setOrderNote(id: string, note: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("orders").update({ ops_note: note || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ orderId: id, entityType: "order", entityId: id, event: "order.note_set", actorId, notes: note ? note.slice(0, 120) : "(cleared)" });
  return { ok: true };
}

/** Operational tags on an order (Gift Wrap / Fragile / VIP / …). */
export async function setOrderTags(id: string, tags: string[], actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const clean = [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("orders").update({ ops_tags: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ orderId: id, entityType: "order", entityId: id, event: "order.tagged", actorId, notes: clean.join(", ") || "(cleared)" });
  return { ok: true };
}

// Note: single-order flag changes reuse the bulk engine (applyBulkAction with one target) so there
// is ONE audited mutation path for fraud/wholesale/incident — no parallel setter to drift.

/** Re-send the order confirmation email (via the notification engine, inline). */
export async function resendConfirmation(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { notify } = await import("@/lib/notifications/engine");
    const { anyFailed } = await notify("order.confirmed", { orderId: id });
    await logEvent({ orderId: id, entityType: "order", entityId: id, event: "order.email_resent", actorId, notes: "confirmation" });
    return anyFailed ? { ok: false, reason: "email channel failed (is Resend configured?)" } : { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "failed" };
  }
}
