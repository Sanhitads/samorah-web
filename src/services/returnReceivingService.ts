/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Return receiving service (Phase 1B-1) — the Return-side integration over the FROZEN inbound-receipt
 * foundation (Phase 1B-0b). It NEVER writes variants.stock and NEVER calls commit_receipt directly:
 * every restock flows through commit_return_receipt() → the frozen commit_receipt() → apply_stock_movement.
 *
 * Three operations:
 *   • getReturnReceiving  — the per-variant read model (Expected / Received / Outstanding / Restockable /
 *                           Damaged / receipt history / who-when / movement linkage; final missing ONLY
 *                           after closure, derived — no scalar shortage stored).
 *   • receiveReturnGoods  — record a physical receipt (received/restockable/damaged per variant) and
 *                           commit it. Gated by requiresPhysicalReturn(resolution) so no-physical-return
 *                           outcomes never mint a receipt or stock.
 *   • closeReturnReceiving — the authoritative closure (DB serialises via the return-row lock); emits the
 *                           structured per-variant closure breakdown to the immutable audit stream.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc } from "@/lib/supabase/rpc";
import { logEvent } from "@/services/auditService";
import { requiresPhysicalReturn, isReceivingInconsistent } from "@/lib/returns/resolution";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

const RECEIVING_STATES = new Set(["received", "inspection"]);

export interface ReceiveLine {
  variantId: string;
  received: number;
  restockable: number;
  damaged: number;
}

export interface ReceivingVariantRow {
  variantRef: string;
  sku: string | null;
  productName: string | null;
  variantName: string | null;
  expected: number; // canonical: SUM(return_items.quantity) for this variant
  received: number; // cumulative committed received
  restockable: number; // cumulative committed restockable (what actually moved to stock)
  damaged: number; // cumulative committed damaged (audit-only, never stock)
  outstanding: number; // expected − received (NOT missing until closed)
  finalMissing: number | null; // derived only after closure; null while receiving is open
}

export interface ReturnReceiptHistory {
  id: string;
  status: string;
  received_by_name: string | null;
  received_at: string | null;
  committed_by_name: string | null;
  committed_at: string | null;
  items: { variantRef: string; sku: string | null; received: number; restockable: number; damaged: number; movementId: string | null }[];
}

export interface ReturnReceivingModel {
  returnId: string;
  status: string;
  resolution: string | null;
  requiresPhysicalReturn: boolean;
  inconsistent: boolean; // no-physical-return resolution that nonetheless reached a receiving state
  legacyRestocked: boolean; // an old return:<id>:% movement proves this return already restocked
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  canReceive: boolean; // physical return required, in a receiving state, not closed, not legacy-restocked
  canClose: boolean; // in a receiving state, not closed, and no open drafts
  openDraftCount: number;
  variants: ReceivingVariantRow[];
  receipts: ReturnReceiptHistory[];
}

/** Per-variant receiving read model for one return. Everything derives from immutable inputs. */
export async function getReturnReceiving(returnId: string): Promise<ReturnReceivingModel | null> {
  const db = loose();
  const { data: ret } = await db
    .from("returns")
    .select("id,status,resolution,receiving_closed_at,receiving_closed_by")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return null;

  const [{ data: retItems }, { data: receipts }, { data: legacy }] = await Promise.all([
    db.from("return_items").select("variant_id,sku,product_name,quantity").eq("return_id", returnId),
    db
      .from("inventory_receipts")
      .select("id,status,received_by,received_at,committed_by,committed_at,created_at")
      .eq("source_type", "return")
      .eq("source_id", returnId)
      .order("created_at"),
    db
      .from("inventory_movements")
      .select("id")
      .eq("source_type", "return")
      .eq("movement_type", "return_restock")
      .like("idempotency_key", `return:${returnId}:%`)
      .limit(1),
  ]);

  const receiptIds = (receipts ?? []).map((r: any) => r.id);
  const { data: allItems } = receiptIds.length
    ? await db.from("inventory_receipt_items").select("*").in("receipt_id", receiptIds)
    : { data: [] as any[] };

  // Canonical expected per variant = SUM of the source return_items quantities.
  const expected = new Map<string, { qty: number; sku: string | null; productName: string | null }>();
  for (const li of retItems ?? []) {
    if (!li.variant_id) continue;
    const cur = expected.get(li.variant_id) ?? { qty: 0, sku: li.sku ?? null, productName: li.product_name ?? null };
    cur.qty += Number(li.quantity ?? 0);
    expected.set(li.variant_id, cur);
  }

  // Cumulative COMMITTED received/restockable/damaged per variant_ref (committed receipts only).
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

  const closed = ret.receiving_closed_at != null;
  const variantRefs = new Set<string>([...expected.keys(), ...committed.keys()]);
  const variants: ReceivingVariantRow[] = [...variantRefs].map((ref) => {
    const exp = expected.get(ref);
    const com = committed.get(ref);
    const expQty = exp?.qty ?? 0;
    const rec = com?.received ?? 0;
    const outstanding = Math.max(0, expQty - rec);
    return {
      variantRef: ref,
      sku: exp?.sku ?? null,
      productName: exp?.productName ?? null,
      variantName: com?.variantName ?? null,
      expected: expQty,
      received: rec,
      restockable: com?.restockable ?? 0,
      damaged: com?.damaged ?? 0,
      outstanding,
      finalMissing: closed ? expQty - rec : null, // derived at/after closure; NOT stored
    };
  });

  // Resolve actor names for closure + receipt history.
  const actorIds = [
    ret.receiving_closed_by,
    ...(receipts ?? []).flatMap((r: any) => [r.received_by, r.committed_by]),
  ].filter(Boolean);
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
  const history: ReturnReceiptHistory[] = (receipts ?? []).map((r: any) => ({
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
  const legacyRestocked = (legacy ?? []).length > 0;
  const inReceivingState = RECEIVING_STATES.has(ret.status);
  const physical = requiresPhysicalReturn(ret.resolution);

  return {
    returnId,
    status: ret.status,
    resolution: ret.resolution ?? null,
    requiresPhysicalReturn: physical,
    inconsistent: isReceivingInconsistent(ret.resolution, ret.status),
    legacyRestocked,
    closed,
    closedAt: ret.receiving_closed_at ?? null,
    closedByName: ret.receiving_closed_by ? names.get(ret.receiving_closed_by) ?? null : null,
    canReceive: physical && inReceivingState && !closed && !legacyRestocked,
    canClose: inReceivingState && !closed && openDraftCount === 0,
    openDraftCount,
    variants,
    receipts: history,
  };
}

export interface ReceiveResult {
  ok: boolean;
  reason?: string;
  receiptId?: string;
  restocked?: number;
}

/**
 * Record and commit ONE physical receipt for a return. Gated on canonical physical-return semantics —
 * NOT on workflow history. Creates a draft receipt + items (snapshotting identity), then commits via the
 * authoritative wrapper. A failed commit voids the just-created draft so no stranded draft is left behind.
 */
export async function receiveReturnGoods(
  returnId: string,
  lines: ReceiveLine[],
  opts?: { note?: string; actorId?: string },
): Promise<ReceiveResult> {
  const db = loose();
  const { data: ret } = await db
    .from("returns")
    .select("id,order_id,rma_number,status,resolution,receiving_closed_at")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return { ok: false, reason: "return_not_found" };

  // Physical-return authority is resolution semantics, never `status`/`from` history.
  if (!requiresPhysicalReturn(ret.resolution)) {
    // Surface an inconsistent lifecycle explicitly rather than silently receiving against it.
    return { ok: false, reason: isReceivingInconsistent(ret.resolution, ret.status) ? "inconsistent_no_physical_return" : "resolution_no_physical_return" };
  }
  if (!RECEIVING_STATES.has(ret.status)) return { ok: false, reason: "invalid_state" };
  if (ret.receiving_closed_at != null) return { ok: false, reason: "receiving_closed" };
  if (!lines.length) return { ok: false, reason: "no_lines" };

  // Canonical expected per variant + identity snapshot from return_items ⋈ variants.
  const { data: retItems } = await db.from("return_items").select("variant_id,sku,product_name,quantity").eq("return_id", returnId);
  const expected = new Map<string, number>();
  const sourceSku = new Map<string, string | null>();
  const sourceProduct = new Map<string, string | null>();
  for (const li of retItems ?? []) {
    if (!li.variant_id) continue;
    expected.set(li.variant_id, (expected.get(li.variant_id) ?? 0) + Number(li.quantity ?? 0));
    if (!sourceSku.has(li.variant_id)) sourceSku.set(li.variant_id, li.sku ?? null);
    if (!sourceProduct.has(li.variant_id)) sourceProduct.set(li.variant_id, li.product_name ?? null);
  }

  const variantIds = lines.map((l) => l.variantId);
  const { data: variants } = await db.from("variants").select("id,sku,variant_name,product_id").in("id", variantIds);
  const vMap = new Map<string, any>((variants ?? []).map((v: any) => [v.id, v]));

  // Validate every line locally (DB CHECKs + commit_receipt remain authoritative).
  for (const l of lines) {
    if (!expected.has(l.variantId)) return { ok: false, reason: "variant_not_in_return" };
    if (!vMap.has(l.variantId)) return { ok: false, reason: "variant_unavailable" };
    if (l.received <= 0) return { ok: false, reason: "received_must_be_positive" };
    if (l.restockable < 0 || l.damaged < 0) return { ok: false, reason: "negative_quantity" };
    if (l.restockable + l.damaged !== l.received) return { ok: false, reason: "split_mismatch" };
  }

  // Create the draft header, then the items.
  const { data: header, error: hErr } = await db
    .from("inventory_receipts")
    .insert({ source_type: "return", source_id: returnId, status: "draft", note: opts?.note ?? null, received_by: opts?.actorId ?? null })
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
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId); // no stranded draft
    return { ok: false, reason: iErr.message };
  }

  // Commit through the authoritative wrapper (return-row lock + legacy + closure guards).
  let res: any;
  try {
    res = await callRpc<any>("commit_return_receipt", { p_receipt_id: receiptId, p_actor_id: opts?.actorId ?? null });
  } catch (e) {
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId);
    return { ok: false, reason: e instanceof Error ? e.message : "commit_failed" };
  }
  if (!res?.ok) {
    await db.from("inventory_receipts").update({ status: "void" }).eq("id", receiptId); // roll back the draft
    return { ok: false, reason: res?.reason ?? "commit_rejected" };
  }

  await logEvent({
    orderId: ret.order_id,
    entityType: "return",
    entityId: returnId,
    event: "return.receipt_committed",
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    notes: ret.rma_number,
    metadata: {
      receipt_id: receiptId,
      restocked: res.restocked ?? 0,
      lines: lines.map((l) => ({ variant_ref: l.variantId, received: l.received, restockable: l.restockable, damaged: l.damaged })),
    },
  });
  return { ok: true, receiptId, restocked: res.restocked ?? 0 };
}

export interface CloseResult {
  ok: boolean;
  reason?: string;
  alreadyClosed?: boolean;
}

/** Authoritatively close receiving for a return, then emit the structured per-variant closure breakdown. */
export async function closeReturnReceiving(returnId: string, opts?: { actorId?: string }): Promise<CloseResult> {
  const db = loose();
  const res = await callRpc<any>("close_return_receiving", { p_return_id: returnId, p_actor_id: opts?.actorId ?? null });
  if (!res?.ok) return { ok: false, reason: res?.reason };
  if (res.already_closed) return { ok: true, alreadyClosed: true };

  // Derive the immutable per-variant shortage breakdown for the audit event (no scalar column stored).
  const model = await getReturnReceiving(returnId);
  const { data: ret } = await db.from("returns").select("order_id,rma_number").eq("id", returnId).maybeSingle();
  await logEvent({
    orderId: ret?.order_id,
    entityType: "return",
    entityId: returnId,
    event: "return.receiving_closed",
    actorType: opts?.actorId ? "staff" : "system",
    actorId: opts?.actorId,
    notes: ret?.rma_number,
    metadata: {
      variants: (model?.variants ?? []).map((v) => ({ variant_ref: v.variantRef, expected: v.expected, received: v.received, missing: v.finalMissing ?? 0 })),
    },
  });
  return { ok: true };
}
