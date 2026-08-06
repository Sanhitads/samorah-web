/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RTO receiving service (Phase 1B-2) — the RTO (return-to-origin) side of the FROZEN inbound-receipt
 * foundation, mirroring returnReceivingService but anchored on the SHIPMENT. It NEVER writes
 * variants.stock and NEVER calls commit_receipt directly: every restock flows through
 * commit_rto_receipt() → the frozen commit_receipt() → apply_stock_movement (movement_type rto_restock,
 * idempotency key rto_receipt_item:<id>). It touches NO financial state (no refund/payment/invoice).
 *
 * The gate is purely logistical: shipments.status='rto' (a bounced parcel is inherently physical goods
 * coming back — there is no resolution to interpret). Physical receiving/closure is an inventory-accounting
 * concern tracked by shipments.rto_receiving_closed_at/by; the shipment status stays terminal 'rto'.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc } from "@/lib/supabase/rpc";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export interface RtoReceiveLine {
  variantId: string;
  received: number;
  restockable: number;
  damaged: number;
}

export interface RtoReceivingVariantRow {
  variantRef: string;
  sku: string | null;
  productName: string | null;
  variantName: string | null;
  expected: number; // canonical: SUM(order_items.quantity) for this variant (1 shipment/order invariant)
  received: number; // cumulative committed received
  restockable: number; // cumulative committed restockable (what moved to stock)
  damaged: number; // cumulative committed damaged (audit-only, never stock)
  outstanding: number; // expected − received (NOT missing until closed)
  finalMissing: number | null; // derived only after closure; null while receiving is open
}

export interface RtoReceiptHistory {
  id: string;
  status: string;
  received_by_name: string | null;
  received_at: string | null;
  committed_by_name: string | null;
  committed_at: string | null;
  items: { variantRef: string; sku: string | null; received: number; restockable: number; damaged: number; movementId: string | null }[];
}

export interface RtoReceivingModel {
  shipmentId: string;
  orderId: string;
  status: string;
  isRto: boolean;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  canReceive: boolean; // status='rto' and not closed
  canClose: boolean; // status='rto', not closed, no open drafts
  openDraftCount: number;
  variants: RtoReceivingVariantRow[];
  receipts: RtoReceiptHistory[];
}

/** Per-variant RTO receiving read model for one shipment. Everything derives from immutable inputs. */
export async function getShipmentRtoReceiving(shipmentId: string): Promise<RtoReceivingModel | null> {
  const db = loose();
  const { data: sh } = await db
    .from("shipments")
    .select("id,order_id,status,rto_receiving_closed_at,rto_receiving_closed_by")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!sh) return null;

  const [{ data: orderItems }, { data: receipts }] = await Promise.all([
    db.from("order_items").select("variant_id,sku,product_name,quantity").eq("order_id", sh.order_id),
    db
      .from("inventory_receipts")
      .select("id,status,received_by,received_at,committed_by,committed_at,created_at")
      .eq("source_type", "rto")
      .eq("source_id", shipmentId)
      .order("created_at"),
  ]);

  const receiptIds = (receipts ?? []).map((r: any) => r.id);
  const { data: allItems } = receiptIds.length
    ? await db.from("inventory_receipt_items").select("*").in("receipt_id", receiptIds)
    : { data: [] as any[] };

  // Canonical expected per variant = SUM of the order_items quantities (whole order = the single shipment).
  const expected = new Map<string, { qty: number; sku: string | null; productName: string | null }>();
  for (const li of orderItems ?? []) {
    if (!li.variant_id) continue;
    const cur = expected.get(li.variant_id) ?? { qty: 0, sku: li.sku ?? null, productName: li.product_name ?? null };
    cur.qty += Number(li.quantity ?? 0);
    expected.set(li.variant_id, cur);
  }

  const committedReceiptIds = new Set((receipts ?? []).filter((r: any) => r.status === "committed").map((r: any) => r.id));
  const committed = new Map<string, { received: number; restockable: number; damaged: number; variantName: string | null }>();
  for (const it of allItems ?? []) {
    if (!committedReceiptIds.has(it.receipt_id)) continue;
    const cur = committed.get(it.variant_ref) ?? { received: 0, restockable: 0, damaged: 0, variantName: it.variant_name_snapshot ?? null };
    cur.received += Number(it.received_qty ?? 0);
    cur.restockable += Number(it.restockable_qty ?? 0);
    cur.damaged += Number(it.damaged_qty ?? 0);
    committed.set(it.variant_ref, cur);
  }

  const closed = sh.rto_receiving_closed_at != null;
  const variantRefs = new Set<string>([...expected.keys(), ...committed.keys()]);
  const variants: RtoReceivingVariantRow[] = [...variantRefs].map((ref) => {
    const exp = expected.get(ref);
    const com = committed.get(ref);
    const expQty = exp?.qty ?? 0;
    const rec = com?.received ?? 0;
    return {
      variantRef: ref,
      sku: exp?.sku ?? null,
      productName: exp?.productName ?? null,
      variantName: com?.variantName ?? null,
      expected: expQty,
      received: rec,
      restockable: com?.restockable ?? 0,
      damaged: com?.damaged ?? 0,
      outstanding: Math.max(0, expQty - rec),
      finalMissing: closed ? expQty - rec : null, // derived at/after closure; NOT stored
    };
  });

  const actorIds = [sh.rto_receiving_closed_by, ...(receipts ?? []).flatMap((r: any) => [r.received_by, r.committed_by])].filter(Boolean);
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await db.from("users").select("id,full_name").in("id", [...new Set(actorIds)]);
    for (const u of users ?? []) names.set(u.id, u.full_name ?? "");
  }

  const itemsByReceipt = new Map<string, any[]>();
  for (const it of allItems ?? []) {
    const arr = itemsByReceipt.get(it.receipt_id) ?? [];
    arr.push(it);
    itemsByReceipt.set(it.receipt_id, arr);
  }
  const history: RtoReceiptHistory[] = (receipts ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    received_by_name: r.received_by ? names.get(r.received_by) ?? null : null,
    received_at: r.received_at ?? null,
    committed_by_name: r.committed_by ? names.get(r.committed_by) ?? null : null,
    committed_at: r.committed_at ?? null,
    items: (itemsByReceipt.get(r.id) ?? []).map((it: any) => ({
      variantRef: it.variant_ref,
      sku: it.sku_snapshot ?? null,
      received: Number(it.received_qty ?? 0),
      restockable: Number(it.restockable_qty ?? 0),
      damaged: Number(it.damaged_qty ?? 0),
      movementId: it.movement_id ?? null,
    })),
  }));

  const openDraftCount = (receipts ?? []).filter((r: any) => r.status === "draft").length;
  const isRto = sh.status === "rto";

  return {
    shipmentId,
    orderId: sh.order_id,
    status: sh.status,
    isRto,
    closed,
    closedAt: sh.rto_receiving_closed_at ?? null,
    closedByName: sh.rto_receiving_closed_by ? names.get(sh.rto_receiving_closed_by) ?? null : null,
    canReceive: isRto && !closed,
    canClose: isRto && !closed && openDraftCount === 0,
    openDraftCount,
    variants,
    receipts: history,
  };
}

export interface RtoReceiveResult {
  ok: boolean;
  reason?: string;
  receiptId?: string;
  restocked?: number;
}

/**
 * Record and commit ONE physical RTO receipt for a shipment. Atomic create+commit with the same
 * VOID-AND-RESUBMIT recovery model as Returns: a failed commit voids the just-created receipt (zero
 * movement, no stranded draft) and the operator resubmits corrected quantities. Financial state is never
 * touched.
 */
export async function receiveRtoGoods(
  shipmentId: string,
  lines: RtoReceiveLine[],
  opts?: { note?: string; actorId?: string },
): Promise<RtoReceiveResult> {
  const db = loose();
  const { data: sh } = await db
    .from("shipments")
    .select("id,order_id,status,rto_receiving_closed_at")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!sh) return { ok: false, reason: "shipment_not_found" };
  if (sh.status !== "rto") return { ok: false, reason: "not_rto" };
  if (sh.rto_receiving_closed_at != null) return { ok: false, reason: "rto_receiving_closed" };
  if (!lines.length) return { ok: false, reason: "no_lines" };

  // Canonical expected per variant + identity snapshot from order_items ⋈ variants.
  const { data: orderItems } = await db.from("order_items").select("variant_id,sku,product_name,quantity").eq("order_id", sh.order_id);
  const expected = new Map<string, number>();
  const sourceSku = new Map<string, string | null>();
  const sourceProduct = new Map<string, string | null>();
  for (const li of orderItems ?? []) {
    if (!li.variant_id) continue;
    expected.set(li.variant_id, (expected.get(li.variant_id) ?? 0) + Number(li.quantity ?? 0));
    if (!sourceSku.has(li.variant_id)) sourceSku.set(li.variant_id, li.sku ?? null);
    if (!sourceProduct.has(li.variant_id)) sourceProduct.set(li.variant_id, li.product_name ?? null);
  }

  const variantIds = lines.map((l) => l.variantId);
  const { data: variants } = await db.from("variants").select("id,sku,variant_name").in("id", variantIds);
  const vMap = new Map<string, any>((variants ?? []).map((v: any) => [v.id, v]));

  for (const l of lines) {
    if (!expected.has(l.variantId)) return { ok: false, reason: "variant_not_in_order" };
    if (!vMap.has(l.variantId)) return { ok: false, reason: "variant_unavailable" };
    if (l.received <= 0) return { ok: false, reason: "received_must_be_positive" };
    if (l.restockable < 0 || l.damaged < 0) return { ok: false, reason: "negative_quantity" };
    if (l.restockable + l.damaged !== l.received) return { ok: false, reason: "split_mismatch" };
  }

  const { data: header, error: hErr } = await db
    .from("inventory_receipts")
    .insert({ source_type: "rto", source_id: shipmentId, status: "draft", note: opts?.note ?? null, received_by: opts?.actorId ?? null })
    .select("id")
    .maybeSingle();
  if (hErr || !header) return { ok: false, reason: hErr?.message ?? "receipt_create_failed" };
  const receiptId = header.id;

  const itemRows = lines.map((l) => {
    const v = vMap.get(l.variantId);
    return {
      receipt_id: receiptId,
      variant_id: l.variantId,
      variant_ref: l.variantId,
      sku_snapshot: v?.sku ?? sourceSku.get(l.variantId) ?? "",
      product_name_snapshot: sourceProduct.get(l.variantId) ?? "",
      variant_name_snapshot: v?.variant_name ?? null,
      expected_qty: expected.get(l.variantId) ?? 0,
      received_qty: l.received,
      restockable_qty: l.restockable,
      damaged_qty: l.damaged,
    };
  });
  const { error: iErr } = await db.from("inventory_receipt_items").insert(itemRows);
  if (iErr) {
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId);
    return { ok: false, reason: iErr.message };
  }

  let res: any;
  try {
    res = await callRpc<any>("commit_rto_receipt", { p_receipt_id: receiptId, p_actor_id: opts?.actorId ?? null });
  } catch (e) {
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId);
    return { ok: false, reason: e instanceof Error ? e.message : "commit_failed" };
  }
  if (!res?.ok) {
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId);
    return { ok: false, reason: res?.reason ?? "commit_rejected" };
  }

  await logEvent({
    orderId: sh.order_id,
    entityType: "shipment",
    entityId: shipmentId,
    event: "shipment.rto_receipt_committed",
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    metadata: {
      receipt_id: receiptId,
      restocked: res.restocked ?? 0,
      lines: lines.map((l) => ({ variant_ref: l.variantId, received: l.received, restockable: l.restockable, damaged: l.damaged })),
    },
  });
  return { ok: true, receiptId, restocked: res.restocked ?? 0 };
}

export interface RtoCloseResult {
  ok: boolean;
  reason?: string;
  alreadyClosed?: boolean;
}

/** Authoritatively close RTO receiving for a shipment, then emit the structured per-variant breakdown. */
export async function closeRtoReceiving(shipmentId: string, opts?: { actorId?: string }): Promise<RtoCloseResult> {
  const db = loose();
  const res = await callRpc<any>("close_rto_receiving", { p_shipment_id: shipmentId, p_actor_id: opts?.actorId ?? null });
  if (!res?.ok) return { ok: false, reason: res?.reason };
  if (res.already_closed) return { ok: true, alreadyClosed: true };

  const model = await getShipmentRtoReceiving(shipmentId);
  const { data: sh } = await db.from("shipments").select("order_id").eq("id", shipmentId).maybeSingle();
  await logEvent({
    orderId: sh?.order_id,
    entityType: "shipment",
    entityId: shipmentId,
    event: "shipment.rto_receiving_closed",
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    metadata: {
      variants: (model?.variants ?? []).map((v) => ({ variant_ref: v.variantRef, expected: v.expected, received: v.received, missing: v.finalMissing ?? 0 })),
    },
  });
  return { ok: true };
}
