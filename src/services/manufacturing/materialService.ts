/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Material & supplier-lot traceability (Phase 3) — lightweight, NOT an ERP.
 * Registers materials + immutable supplier lots, records per-batch consumption, and
 * answers both traceability directions:
 *   • lotsForBatch(batchId)  — which material lots went into a batch
 *   • batchesForLot(lotId)   — which batches consumed a supplier lot (reverse)
 * Writes are capability-gated (manufacturing.operate) and go through SECURITY DEFINER
 * RPCs. NON-STOCK. supplier_lot_code is immutable (DB unique; no update path).
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export interface RegisterMaterialInput { name: string; materialType: "wax" | "fragrance" | "wick" | "vessel" | "packaging" | "dye" | "other"; defaultUom?: string }
export interface RegisterLotInput { materialId: string; supplierLotCode: string; supplierName?: string; receivedQty?: number; uom?: string; receivedOn?: string }
export interface ConsumptionInput { batchId: string; materialLotId: string; qtyConsumed: number; uom?: string; idempotencyKey?: string }

export async function registerMaterial(actor: StaffActor, input: RegisterMaterialInput): Promise<string> {
  assertCap(actor, "manufacturing.operate");
  const res = await callRpc<any>("register_material", { p: { name: input.name, material_type: input.materialType, default_uom: input.defaultUom ?? "" } });
  return res.material_id as string;
}

export async function registerMaterialLot(actor: StaffActor, input: RegisterLotInput): Promise<string> {
  assertCap(actor, "manufacturing.operate");
  const res = await callRpc<any>("register_material_lot", {
    p: { material_id: input.materialId, supplier_lot_code: input.supplierLotCode, supplier_name: input.supplierName ?? "", received_qty: input.receivedQty ?? null, uom: input.uom ?? "", received_on: input.receivedOn ?? "" },
  });
  return res.material_lot_id as string;
}

export async function recordConsumption(actor: StaffActor, input: ConsumptionInput): Promise<{ consumptionId: string; idempotent: boolean }> {
  assertCap(actor, "manufacturing.operate");
  const res = await callRpc<any>("record_material_consumption", {
    p: { batch_id: input.batchId, material_lot_id: input.materialLotId, qty_consumed: input.qtyConsumed, uom: input.uom ?? "", idempotency_key: input.idempotencyKey ?? "" },
  });
  if (!res.idempotent) {
    await logEvent({ entityType: "material", entityId: input.materialLotId, event: "material.consumed", actorType: "staff", actorId: actor.userId, notes: input.batchId });
  }
  return { consumptionId: res.consumption_id as string, idempotent: !!res.idempotent };
}

// ── Reads / traceability (service-role) ──────────────────────────────────────
export async function listMaterials(): Promise<any[]> {
  const { data } = await db().from("materials").select("*").order("material_type").order("name");
  return data ?? [];
}

export async function listMaterialLots(materialId?: string): Promise<any[]> {
  let q = db().from("material_lots").select("id,supplier_lot_code,supplier_name,received_qty,uom,material_id,materials(name,material_type)").order("created_at", { ascending: false }).limit(200);
  if (materialId) q = q.eq("material_id", materialId);
  const { data } = await q;
  return data ?? [];
}
export async function lotsForBatch(batchId: string): Promise<any[]> {
  const { data } = await db().from("batch_material_consumption")
    .select("qty_consumed, uom, material_lots(id, supplier_lot_code, supplier_name, material_id, materials(name, material_type))")
    .eq("batch_id", batchId);
  return data ?? [];
}
export async function batchesForLot(materialLotId: string): Promise<any[]> {
  const { data } = await db().from("batch_material_consumption")
    .select("qty_consumed, uom, manufacturing_batches(id, batch_code, variant_id, lifecycle_status, manufacturing_date)")
    .eq("material_lot_id", materialLotId);
  return data ?? [];
}
