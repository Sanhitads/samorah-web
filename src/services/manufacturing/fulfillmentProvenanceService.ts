/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8 — physical fulfilment provenance (pick/pack/substitution/shipment traceability).
 * INERT for untracked commerce (every current variant is untracked; confirm_pick_batch requires a tracked
 * variant). All stock-affecting work goes through the SECURITY DEFINER RPCs; variants.stock is never
 * changed here (substitution is intra-variant batch reassignment). Capability-gated; actor server-derived.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient() as unknown as { from: (t: string) => any };

/** Server-authoritative quantity entitlement per order item (ordered / allocated / picked / shipped /
 *  refunded-identifiable / remaining-fulfillable) + order-level block (exception/cancelled/refunded/ambiguous). */
export async function getOrderEntitlements(orderId: string): Promise<any> {
  return callRpc<any>("order_item_entitlements", { p_order_id: orderId });
}

export interface ConfirmPickInput { orderItemId: string; batchId: string; qty: number; componentKey?: string; reason?: string }

/** Confirm the ACTUAL manufacturing batch of picked units (B.2); a batch ≠ the payment-time allocation is a
 *  controlled, audited substitution (B.3). Enforces entitlement + batch eligibility server-side (B.4). */
export async function confirmPickBatch(actor: StaffActor, input: ConfirmPickInput): Promise<{ ok: boolean; substitution?: boolean; pickedTotal?: number }> {
  assertCap(actor, "manufacturing.operate");
  const r = await callRpc<any>("confirm_pick_batch", { p: { order_item_id: input.orderItemId, batch_id: input.batchId, qty: input.qty, component_key: input.componentKey ?? "", reason: input.reason ?? "", actor_id: actor.userId } });
  await logEvent({ entityType: "order", entityId: input.orderItemId, event: r?.substitution ? "fulfillment.pick_substitution" : "fulfillment.pick_confirmed", actorType: "staff", actorId: actor.userId, notes: input.reason, metadata: { batch_id: input.batchId, qty: input.qty, substitution: r?.substitution } });
  return { ok: !!r?.ok, substitution: !!r?.substitution, pickedTotal: r?.picked_total };
}

/** Freeze the confirmed batch quantities onto the shipment (immutable provenance, B.6). */
export async function confirmShipmentProvenance(actor: StaffActor, shipmentId: string): Promise<{ ok: boolean; frozenLines?: number; alreadyFrozen?: boolean }> {
  assertCap(actor, "manufacturing.operate");
  const r = await callRpc<any>("confirm_shipment_provenance", { p_shipment_id: shipmentId, p_actor: actor.userId });
  await logEvent({ entityType: "shipment", entityId: shipmentId, event: "fulfillment.shipment_provenance_frozen", actorType: "staff", actorId: actor.userId, metadata: { frozen_lines: r?.frozen_lines } });
  return { ok: !!r?.ok, frozenLines: r?.frozen_lines, alreadyFrozen: !!r?.already_frozen };
}

export interface PackingChecklist { product_ok: boolean; variant_ok: boolean; batch_ok: boolean; qty_ok: boolean; vessel_ok: boolean; label_ok: boolean; packaging_ok: boolean }

/** Record routine packing QC (separate from manufacturing/burn QC, B.5). */
export async function recordPackingQc(actor: StaffActor, orderId: string, checklist: PackingChecklist, opts?: { shipmentId?: string; notes?: string }): Promise<{ ok: boolean; passed?: boolean }> {
  assertCap(actor, "manufacturing.qc");
  const r = await callRpc<any>("record_packing_qc", { p: { order_id: orderId, shipment_id: opts?.shipmentId ?? null, checklist, notes: opts?.notes ?? "", actor_id: actor.userId } });
  await logEvent({ entityType: "order", entityId: orderId, event: r?.passed ? "fulfillment.packing_qc_passed" : "fulfillment.packing_qc_failed", actorType: "staff", actorId: actor.userId, notes: opts?.notes, metadata: { checklist } });
  return { ok: !!r?.ok, passed: !!r?.passed };
}

/** Reverse traceability: the confirmed shipped batches for one order (order → actual batches). */
export async function orderShippedBatches(orderId: string): Promise<any[]> {
  const { data } = await db().from("shipment_batch_lines").select("shipment_id,order_item_id,variant_id,batch_id,component_key,qty").eq("order_id", orderId);
  return data ?? [];
}

/** Reverse traceability: the orders/customers a batch shipped to (batch → orders). Internal use only. */
export async function batchShippedOrders(batchId: string): Promise<any[]> {
  const { data } = await db().from("shipment_batch_lines").select("order_id,order_item_id,shipment_id,qty").eq("batch_id", batchId);
  return data ?? [];
}

/** Actual batch confirmations for an order (picked provenance, pre-shipment). */
export async function orderPickConfirmations(orderId: string): Promise<any[]> {
  const { data } = await db().from("batch_pick_confirmations").select("order_item_id,variant_id,batch_id,qty,is_substitution,allocated_batch_id,reason,confirmed_at").eq("order_id", orderId).order("confirmed_at");
  return data ?? [];
}
