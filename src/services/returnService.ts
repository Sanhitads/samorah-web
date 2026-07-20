/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Returns service (review point 9) — the integrative module. A return moves through
 * its own state machine and, at the right transitions, reaches into the other
 * modules: it RESTOCKS inventory and issues a REFUND when it settles, writes to the
 * immutable AUDIT stream throughout, and (later) notifies the customer + schedules a
 * reverse SHIPMENT. Forward and reverse logistics stay separate state machines.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc } from "@/lib/supabase/rpc";
import { getOrderByNumber } from "@/services/orderService";
import { issueRefund, getOrderRefunds } from "@/services/refundService";
import { logEvent } from "@/services/auditService";
import { assertReturnTransition, isResolutionLocked, isTerminalReturn, nextReturnStates, type ReturnStatus, type ReturnReason } from "@/lib/returns/state";
import type { NotificationEvent } from "@/lib/notifications/types";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/**
 * Fire a return notification through the engine. Lazy import breaks the module
 * cycle (returnService → engine → email channel → returnService) and keeps
 * notification failures from ever breaking the return transition.
 */
async function emitReturnEvent(event: NotificationEvent, orderId: string, returnId: string): Promise<void> {
  try {
    const { notify } = await import("@/lib/notifications/engine");
    await notify(event, { orderId, returnId });
  } catch (e) {
    console.error("return notify failed", e);
  }
}

// Reasons where the item should NOT go back to sellable stock by default.
const NON_RESTOCK_REASONS = new Set<ReturnReason>(["damaged", "defective"]);

export interface CreateReturnItem {
  orderItemId?: string;
  variantId?: string | null;
  sku?: string | null;
  productName?: string | null;
  quantity: number;
  lineAmount: number;
  restock?: boolean;
}

export interface CreateReturnInput {
  orderNumber: string;
  reason: ReturnReason;
  returnType?: "refund" | "replacement" | "exchange";
  items?: CreateReturnItem[]; // omit = full return of every line
  notes?: string;
  actorId?: string;
}

/** Open a return (RMA). Defaults to a full return when no items are specified. */
export async function createReturn(input: CreateReturnInput): Promise<{ ok: boolean; returnId?: string; rma?: string; reason?: string }> {
  const order = await getOrderByNumber(input.orderNumber);
  if (!order) return { ok: false, reason: "order_not_found" };
  const o = order as unknown as { id: string; order_number: string; order_items?: any[] };

  const defaultRestock = !NON_RESTOCK_REASONS.has(input.reason);
  const items: CreateReturnItem[] =
    input.items && input.items.length
      ? input.items
      : (o.order_items ?? []).map((li: any) => ({
          orderItemId: li.id,
          variantId: li.variant_id,
          sku: li.sku,
          productName: li.product_name,
          quantity: li.quantity,
          lineAmount: Number(li.line_total ?? 0),
          restock: defaultRestock,
        }));
  if (!items.length) return { ok: false, reason: "no_items" };

  const refundAmount = items.reduce((s, it) => s + Number(it.lineAmount ?? 0), 0);
  const db = loose();

  // RMA: one per return; suffix when an order has multiple.
  const { data: prior } = await db.from("returns").select("id").eq("order_id", o.id);
  const n = (prior ?? []).length;
  const rma = n === 0 ? `RMA-${o.order_number}` : `RMA-${o.order_number}-${n + 1}`;

  const { data: created, error } = await db
    .from("returns")
    .insert({
      order_id: o.id,
      order_number: o.order_number,
      rma_number: rma,
      status: "requested",
      reason: input.reason,
      return_type: input.returnType ?? "refund",
      refund_amount: refundAmount,
      notes: input.notes ?? null,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, reason: error?.message ?? "insert_failed" };
  const returnId = created.id as string;

  await db.from("return_items").insert(
    items.map((it) => ({
      return_id: returnId,
      order_item_id: it.orderItemId ?? null,
      variant_id: it.variantId ?? null,
      sku: it.sku ?? null,
      product_name: it.productName ?? null,
      quantity: it.quantity,
      line_amount: Number(it.lineAmount ?? 0),
      restock: it.restock ?? defaultRestock,
    })),
  );
  await db.from("return_events").insert({ return_id: returnId, status: "requested", description: input.reason });

  await logEvent({
    orderId: o.id,
    entityType: "return",
    entityId: returnId,
    event: "return.requested",
    actorType: input.actorId ? "staff" : "system",
    actorId: input.actorId,
    newState: "requested",
    notes: `${rma} · ${input.reason}`,
    metadata: { rma, returnType: input.returnType ?? "refund", refundAmount, items: items.length },
  });

  await emitReturnEvent("return.requested", o.id, returnId);
  return { ok: true, returnId, rma };
}

/**
 * Advance a return through its state machine. On entry to `refund` it settles the
 * money side (issue refund for the RMA amount) and the inventory side (restock the
 * flagged lines) — exactly once, guarded by the existing refund_id.
 */
export async function advanceReturn(
  returnId: string,
  to: ReturnStatus,
  opts?: { actorId?: string },
): Promise<{ ok: boolean; from?: ReturnStatus; to?: ReturnStatus; reason?: string }> {
  const db = loose();
  const { data: ret } = await db
    .from("returns")
    .select("id,order_id,status,reason,return_type,refund_amount,refund_id,rma_number")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };

  const from = ret.status as ReturnStatus;
  assertReturnTransition(from, to);

  let refundId: string | null = ret.refund_id ?? null;
  let restocked = 0;

  if (to === "refund_processing") {
    // Restock the sellable lines (inventory tie), once.
    restocked = await callRpc<number>("restock_return_items", { p_return_id: returnId });

    // Issue the refund (payments tie) for refund/exchange types, once.
    if (!refundId && ret.return_type !== "replacement" && Number(ret.refund_amount ?? 0) > 0) {
      const { data: order } = await db.from("orders").select("razorpay_payment_id").eq("id", ret.order_id).maybeSingle();
      const r = await issueRefund({
        orderId: ret.order_id,
        amount: Number(ret.refund_amount),
        reason: `Return ${ret.rma_number}`,
        actorId: opts?.actorId,
        paymentId: order?.razorpay_payment_id ?? null,
      });
      if (r.ok) refundId = r.refundId ?? null;
    }
  }

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (refundId && !ret.refund_id) patch.refund_id = refundId;
  if (isTerminalReturn(to)) patch.closed_at = new Date().toISOString();
  await db.from("returns").update(patch).eq("id", returnId);
  await db.from("return_events").insert({ return_id: returnId, status: to });

  await logEvent({
    orderId: ret.order_id,
    entityType: "return",
    entityId: returnId,
    event: `return.${to}`,
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    previousState: from,
    newState: to,
    notes: ret.rma_number,
    metadata: to === "refund_processing" ? { restocked, refundId } : undefined,
  });

  // Notify the customer on the meaningful transitions (fan-out via the engine).
  const NOTIFY: Partial<Record<ReturnStatus, NotificationEvent>> = {
    approved: "return.approved",
    rejected: "return.rejected",
    refunded: "return.refunded",
  };
  const ev = NOTIFY[to];
  if (ev) await emitReturnEvent(ev, ret.order_id, returnId);

  return { ok: true, from, to };
}

export interface ReturnRow {
  id: string;
  rma: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string | null;
  returnType: string;
  refundAmount: number;
  itemCount: number;
  nextStates: ReturnStatus[];
  createdAt: string;
}

export interface ReturnEmailContext {
  order_number: string;
  rma: string;
  ship_full_name: string | null;
  email: string;
  reason: string | null;
  return_type: string | null;
  refund_amount: number | null;
}

/** Assemble the email context for a return (joins the order for name + email). */
export async function getReturnInfo(returnId: string): Promise<ReturnEmailContext | null> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("rma_number,order_number,reason,return_type,refund_amount,orders(email,ship_full_name)")
    .eq("id", returnId)
    .maybeSingle();
  if (!data) return null;
  const o = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  return {
    order_number: data.order_number,
    rma: data.rma_number,
    ship_full_name: o?.ship_full_name ?? null,
    email: o?.email ?? "",
    reason: data.reason ?? null,
    return_type: data.return_type ?? null,
    refund_amount: data.refund_amount != null ? Number(data.refund_amount) : null,
  };
}

/** Open + recent returns for the admin module. */
export async function getReturnsQueue(limit = 100): Promise<ReturnRow[]> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("id,rma_number,order_number,status,reason,return_type,refund_amount,created_at,return_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    rma: r.rma_number,
    orderNumber: r.order_number,
    status: r.status as ReturnStatus,
    reason: r.reason,
    returnType: r.return_type,
    refundAmount: Number(r.refund_amount ?? 0),
    itemCount: (r.return_items ?? []).reduce((s: number, it: any) => s + (it.quantity ?? 0), 0),
    nextStates: nextReturnStates(r.status as ReturnStatus),
    createdAt: r.created_at,
  }));
}

/** Returns for ONE order (Order Detail returns section). Additive reader over the existing table;
 *  one indexed query by order_id, no new logic. */
export async function getReturnsForOrder(orderId: string): Promise<Array<{ id: string; rma: string | null; status: string; reason: string | null; refundAmount: number; createdAt: string }>> {
  const db = loose();
  const { data } = await db
    .from("returns")
    .select("id,rma_number,status,reason,refund_amount,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    rma: r.rma_number ?? null,
    status: r.status as string,
    reason: r.reason ?? null,
    refundAmount: Number(r.refund_amount ?? 0),
    createdAt: r.created_at,
  }));
}

export interface ReturnUpdate {
  resolution?: string;
  resolutionReason?: string; // → returns.resolution_reason (the WHY behind the resolution)
  refundMethod?: string;
  inspectionResult?: string;
  inspectionNote?: string;
  warehouseDecision?: string;
  damage?: string;
  internalNote?: string; // → returns.notes
  customerMessage?: string; // → returns.customer_message
}

/**
 * Set the Resolution-Center fields on a return (any subset). Resolution / inspection / warehouse
 * decision each stamp operator + timestamp; every change writes ONE audit event. Reuses the same
 * logEvent + returns table — no parallel record. Capability is enforced at the route.
 */
export async function updateReturnRecord(returnId: string, u: ReturnUpdate, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("id,order_id,rma_number,status").eq("id", returnId).maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };

  // Resolution + refund method are locked once the return has settled (refund paid / replacement
  // shipped / closed / rejected) — server-side guard mirroring the disabled UI (review priority 1).
  if ((u.resolution !== undefined || u.refundMethod !== undefined) && isResolutionLocked(ret.status as ReturnStatus)) {
    return { ok: false, reason: "resolution_locked" };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  const changes: string[] = [];

  if (u.resolution !== undefined) { patch.resolution = u.resolution || null; patch.resolution_by = actorId ?? null; patch.resolved_at = now; changes.push(`resolution=${u.resolution || "cleared"}`); }
  if (u.resolutionReason !== undefined) { patch.resolution_reason = u.resolutionReason || null; changes.push("resolution reason"); }
  if (u.refundMethod !== undefined) { patch.refund_method = u.refundMethod || null; changes.push(`refund_method=${u.refundMethod || "cleared"}`); }
  if (u.inspectionResult !== undefined) { patch.inspection_result = u.inspectionResult || null; patch.inspection_by = actorId ?? null; patch.inspected_at = now; changes.push(`inspection=${u.inspectionResult || "cleared"}`); }
  if (u.inspectionNote !== undefined) patch.inspection_note = u.inspectionNote || null;
  if (u.warehouseDecision !== undefined) { patch.warehouse_decision = u.warehouseDecision || null; patch.warehouse_decision_by = actorId ?? null; patch.warehouse_decided_at = now; changes.push(`warehouse=${u.warehouseDecision || "cleared"}`); }
  if (u.damage !== undefined) { patch.damage_classification = u.damage || null; changes.push(`damage=${u.damage || "cleared"}`); }
  if (u.internalNote !== undefined) { patch.notes = u.internalNote || null; changes.push("internal note"); }
  if (u.customerMessage !== undefined) { patch.customer_message = u.customerMessage || null; changes.push("customer message"); }

  if (changes.length === 0) return { ok: true };
  const { error } = await db.from("returns").update(patch).eq("id", returnId);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ orderId: ret.order_id, entityType: "return", entityId: returnId, event: "return.updated", actorType: actorId ? "staff" : "system", actorId, notes: `${ret.rma_number}: ${changes.join(", ")}`, metadata: { ...u } });
  return { ok: true };
}

/**
 * Finance summary for one return (review priorities 2 + 7). Everything here is DERIVED from data we
 * already store — the return's single `refund_amount` + the order's GST-inclusive breakdown — so
 * finance sees the money picture on one card with no new columns and no fabricated figures. The GST
 * portion of a refund is split out using the order's effective inclusive rate (tax / total). Reverse-
 * logistics cost and unit COGS are NOT tracked, so true "loss" analytics stays post-launch (netCashOut
 * is the honest cash figure: what actually leaves the business).
 */
export interface ReturnFinance {
  customerPaid: number;        // order total (what the customer paid for the whole order)
  goodsValue: number;          // Σ returned line amounts (retail value of the goods in this return)
  refundAmount: number;        // the return's refund figure (planned or issued)
  refundGst: number;           // GST portion within the refund (derived, inclusive split)
  refundTaxable: number;       // refund minus its GST portion
  refundMethod: string | null;
  refundId: string | null;
  refundIssued: boolean;       // a real refund id exists (else it's planned, not yet paid)
  intraState: boolean;         // CGST+SGST (true) vs IGST (false) — for the GST label
  storeCredit: number;         // real store credit (0 until the ledger ships post-launch)
  replacementValue: number | null; // retail value reshipped, when the resolution sends goods back out
  netCashOut: number;          // honest cash leaving the business = refundAmount
  isReplacement: boolean;
  isExchange: boolean;
  refundProgress: RefundProgress; // real gateway/ledger state (review priority 6)
  refundError: string | null;  // gateway error when the refund failed
}

/** Where the refund actually is, read from the `refunds` ledger — not guessed. `null` = no refund
 *  applies (e.g. a pure replacement); "waiting" = owed but no ledger row yet. */
export type RefundProgress = "waiting" | "processing" | "completed" | "failed" | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeReturnFinance(order: any, ret: any, items: any[], refunds: any[]): ReturnFinance {
  const total = Number(order?.total_amount ?? 0);
  const orderTax = Number(order?.cgst_amount ?? 0) + Number(order?.sgst_amount ?? 0) + Number(order?.igst_amount ?? 0);
  const refundAmount = Number(ret?.refund_amount ?? 0);
  const taxFraction = total > 0 ? orderTax / total : 0;
  const refundGst = round2(refundAmount * taxFraction);
  const goodsValue = round2(items.reduce((s, it) => s + Number(it.line_amount ?? 0), 0));
  const isReplacement = ret?.return_type === "replacement" || ret?.resolution === "replacement_only";
  const isExchange = ret?.return_type === "exchange" || ret?.resolution === "exchange";
  const sendsGoods = isReplacement || isExchange;

  // Tie the refund ledger to THIS return via its RMA (refunds are logged with reason "Return <RMA>").
  const mine = (refunds ?? []).filter((r) => String(r.reason ?? "").includes(ret?.rma_number ?? " "));
  const latest = mine[0]; // getOrderRefunds returns newest-first
  const owesRefund = refundAmount > 0 && !isReplacement;
  let refundProgress: RefundProgress = null;
  let refundError: string | null = null;
  if (latest) {
    refundProgress = latest.status === "processed" ? "completed" : latest.status === "processing" ? "processing" : latest.status === "failed" ? "failed" : "waiting";
    refundError = latest.error_description ?? null;
  } else if (owesRefund) {
    refundProgress = "waiting";
  }

  return {
    customerPaid: round2(total),
    goodsValue,
    refundAmount: round2(refundAmount),
    refundGst,
    refundTaxable: round2(refundAmount - refundGst),
    refundMethod: ret?.refund_method ?? null,
    refundId: ret?.refund_id ?? null,
    refundIssued: refundProgress === "completed" || !!ret?.refund_id,
    intraState: Number(order?.igst_amount ?? 0) === 0,
    storeCredit: ret?.refund_method === "store_credit" ? refundAmount : 0,
    replacementValue: sendsGoods ? goodsValue : null,
    netCashOut: round2(refundAmount),
    isReplacement,
    isExchange,
    refundProgress,
    refundError,
  };
}

/**
 * Retry a failed return refund (review follow-on). A gateway refund can fail (e.g. Razorpay
 * BAD_REQUEST) — the ledger records it `failed` and the return sits with no linked refund. This
 * re-issues through the SAME ledger: `begin_refund` excludes failed rows from its over-refund guard
 * and only `processed` rows count toward the order total, so re-calling `issueRefund` can never
 * double-refund. On success it links the refund and, if the money fully processed while the return
 * is mid-refund, completes it (→ refunded, which notifies the customer). Gated returns.approve at the
 * route (issuing money), same as the original refund transition.
 */
export async function retryReturnRefund(returnId: string, actorId?: string): Promise<{ ok: boolean; status?: string; refundId?: string; reason?: string }> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("id,order_id,status,return_type,refund_amount,refund_id,rma_number").eq("id", returnId).maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };
  if (ret.return_type === "replacement") return { ok: false, reason: "replacement_has_no_refund" };
  const amount = Number(ret.refund_amount ?? 0);
  if (amount <= 0) return { ok: false, reason: "no_refund_amount" };
  if (ret.refund_id) return { ok: false, reason: "already_refunded" };

  // Only retry when the latest attempt for this return actually failed — don't fire a second gateway
  // call while one is still processing (begin_refund's guard is the ultimate backstop regardless).
  const refunds = await getOrderRefunds(ret.order_id);
  const mine = refunds.filter((r) => String(r.reason ?? "").includes(ret.rma_number ?? " "));
  const latest = mine[0];
  if (latest && (latest.status === "processing" || latest.status === "processed")) return { ok: false, reason: "refund_not_failed" };

  const { data: order } = await db.from("orders").select("razorpay_payment_id").eq("id", ret.order_id).maybeSingle();
  const r = await issueRefund({
    orderId: ret.order_id, amount, reason: `Return ${ret.rma_number}`, refundType: "return_retry",
    actorId, paymentId: order?.razorpay_payment_id ?? null,
  });

  await logEvent({
    orderId: ret.order_id, entityType: "return", entityId: returnId,
    event: r.ok ? "return.refund_retried" : "return.refund_retry_failed",
    actorType: actorId ? "staff" : "system", actorId,
    notes: `${ret.rma_number}: refund retry ${r.ok ? `→ ${r.status}` : `failed — ${r.reason ?? "error"}`}`,
    metadata: { amount, status: r.status ?? null, refundId: r.refundId ?? null, reason: r.reason ?? null },
  });

  if (!r.ok) return { ok: false, reason: r.reason ?? "refund_failed", status: r.status };

  if (r.refundId) await db.from("returns").update({ refund_id: r.refundId, updated_at: new Date().toISOString() }).eq("id", returnId);
  // Fully processed while mid-refund → complete the return the same way the normal flow does.
  if (r.status === "processed" && ret.status === "refund_processing") {
    await advanceReturn(returnId, "refunded", { actorId });
  }
  return { ok: true, status: r.status, refundId: r.refundId };
}

/** Full return record for the Resolution Center detail page: the row (all resolution/inspection/
 *  warehouse/notes fields + resolved actor names, incl. approver + refunder from the audit stream),
 *  its line items, its evidence attachments, and a derived finance summary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReturnDetail(returnId: string): Promise<{ ret: any; items: any[]; attachments: any[]; finance: ReturnFinance } | null> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("*").eq("id", returnId).maybeSingle();
  if (!ret) return null;
  const [{ data: items }, { data: attachments }, { data: order }, { data: evAudit }, refunds] = await Promise.all([
    db.from("return_items").select("*").eq("return_id", returnId).order("created_at"),
    db.from("return_attachments").select("*").eq("return_id", returnId).order("created_at"),
    db.from("orders").select("total_amount,subtotal,discount_amount,taxable_amount,cgst_amount,sgst_amount,igst_amount,shipping_charge,shipping_amount,refund_amount,refunded_at").eq("id", ret.order_id).maybeSingle(),
    db.from("audit_events").select("event,actor_id,created_at").eq("entity_id", returnId).in("event", ["return.approved", "return.refunded", "return.refund_processing"]).order("created_at"),
    getOrderRefunds(ret.order_id),
  ]);
  // The approver + refunder live in the audit stream (no dedicated column) — reuse it (priority 4).
  const approvedEv = (evAudit ?? []).find((e: { event: string }) => e.event === "return.approved");
  const refundEv = (evAudit ?? []).find((e: { event: string }) => e.event === "return.refunded") ?? (evAudit ?? []).find((e: { event: string }) => e.event === "return.refund_processing");

  // Resolve every referenced actor in one pass — decision owners + evidence uploaders (priority 3).
  const uploaderIds = (attachments ?? []).map((a: { uploaded_by: string | null }) => a.uploaded_by).filter(Boolean);
  const ids = [...new Set([ret.resolution_by, ret.inspection_by, ret.warehouse_decision_by, ret.created_by, approvedEv?.actor_id, refundEv?.actor_id, ...uploaderIds].filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await db.from("users").select("id,full_name").in("id", ids);
    for (const u of users ?? []) names.set(u.id, u.full_name ?? "");
  }
  ret.resolution_by_name = ret.resolution_by ? names.get(ret.resolution_by) ?? null : null;
  ret.inspection_by_name = ret.inspection_by ? names.get(ret.inspection_by) ?? null : null;
  ret.warehouse_decision_by_name = ret.warehouse_decision_by ? names.get(ret.warehouse_decision_by) ?? null : null;
  ret.created_by_name = ret.created_by ? names.get(ret.created_by) ?? null : null;
  ret.approved_by_name = approvedEv?.actor_id ? names.get(approvedEv.actor_id) ?? null : null;
  ret.approved_at = approvedEv?.created_at ?? null;
  ret.refund_by_name = refundEv?.actor_id ? names.get(refundEv.actor_id) ?? null : null;
  ret.refund_at = refundEv?.created_at ?? null;

  // Stamp each attachment with its uploader's display name (staff name, else "Customer").
  const atts = (attachments ?? []).map((a: { uploaded_by: string | null; source: string | null }) => ({
    ...a,
    uploaded_by_name: a.uploaded_by ? names.get(a.uploaded_by) ?? null : (a.source === "customer" ? "Customer" : null),
  }));

  const finance = computeReturnFinance(order, ret, items ?? [], refunds ?? []);
  return { ret, items: items ?? [], attachments: atts, finance };
}

export interface EvidenceInput {
  kind: "image" | "video";
  url: string;
  publicId?: string | null;
  caption?: string | null;
  source?: "admin" | "customer";
}

/**
 * Attach one piece of customer evidence (photo / video) to a return. The bytes are already in
 * Cloudinary (reusing the media provider) — this records the row in `return_attachments` and audits
 * it. `source` distinguishes admin-attached (CS forwards what a customer emailed) from a future
 * customer-portal upload; both write the same table.
 */
export async function attachReturnEvidence(returnId: string, ev: EvidenceInput, actorId?: string): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("id,order_id,rma_number").eq("id", returnId).maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };
  const row = {
    return_id: returnId, kind: ev.kind, url: ev.url, public_id: ev.publicId ?? null,
    caption: ev.caption ?? null, uploaded_by: actorId ?? null, source: ev.source ?? "admin",
  };
  const { data, error } = await db.from("return_attachments").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, reason: error.message };
  await logEvent({ orderId: ret.order_id, entityType: "return", entityId: returnId, event: "return.evidence_added", actorType: actorId ? "staff" : "system", actorId, notes: `${ret.rma_number}: ${ev.kind} evidence attached${ev.caption ? ` — ${ev.caption}` : ""}`, metadata: { kind: ev.kind, source: ev.source ?? "admin" } });
  return { ok: true, id: data?.id };
}

/** Remove one evidence attachment. Deletes the row (source of truth) then best-effort destroys the
 *  Cloudinary asset; a failed destroy never blocks the removal. Audited. */
export async function deleteReturnEvidence(attachmentId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { data: att } = await db.from("return_attachments").select("id,return_id,public_id,kind").eq("id", attachmentId).maybeSingle();
  if (!att) return { ok: false, reason: "attachment_not_found" };
  const { data: ret } = await db.from("returns").select("order_id,rma_number").eq("id", att.return_id).maybeSingle();
  const { error } = await db.from("return_attachments").delete().eq("id", attachmentId);
  if (error) return { ok: false, reason: error.message };
  if (att.public_id) {
    try {
      const { cloudinaryProvider } = await import("@/services/media/cloudinaryProvider");
      await cloudinaryProvider.destroy(att.public_id);
    } catch (e) { console.error("evidence destroy failed", e); }
  }
  await logEvent({ orderId: ret?.order_id, entityType: "return", entityId: att.return_id, event: "return.evidence_removed", actorType: actorId ? "staff" : "system", actorId, notes: `${ret?.rma_number ?? "return"}: ${att.kind} evidence removed`, metadata: { attachmentId } });
  return { ok: true };
}
