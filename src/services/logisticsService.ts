/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Thin DB services for the operational engines: exceptions (§7), returns (§8),
 * business rules (§12), courier capabilities (§4). State transitions are guarded by
 * the pure state machines; loaders fall back to empty/config on error.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { assertExceptionTransition, isValidExceptionType, type ExceptionStatus, type ExceptionType } from "@/lib/exceptions/state";
import { assertReturnTransition, type ReturnStatus, type ReturnReason } from "@/lib/returns/state";
import type { BusinessRule } from "@/lib/rules/engine";
import type { CourierCapability } from "@/lib/shipping/decision";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}
const nowIso = () => new Date().toISOString();

// ── §7 Exceptions ─────────────────────────────────────────────────────────────
export async function raiseException(input: {
  orderId?: string;
  shipmentId?: string;
  type: ExceptionType;
  description?: string;
}): Promise<{ id: string }> {
  if (!isValidExceptionType(input.type)) throw new Error(`invalid exception type: ${input.type}`);
  const db = loose();
  const { data, error } = await db
    .from("shipment_exceptions")
    .insert({ order_id: input.orderId ?? null, shipment_id: input.shipmentId ?? null, type: input.type, status: "open", description: input.description ?? null })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function transitionException(id: string, to: ExceptionStatus, opts?: { resolution?: string }): Promise<void> {
  const db = loose();
  const { data: ex } = await db.from("shipment_exceptions").select("status").eq("id", id).maybeSingle();
  if (!ex) throw new Error("exception not found");
  assertExceptionTransition(ex.status as ExceptionStatus, to);
  const patch: Record<string, unknown> = { status: to };
  if (to === "resolved") {
    patch.resolved_at = nowIso();
    if (opts?.resolution) patch.resolution = opts.resolution;
  }
  await db.from("shipment_exceptions").update(patch).eq("id", id);
}

// ── §8 Returns ────────────────────────────────────────────────────────────────
export async function requestReturn(input: { orderNumber: string; reason?: ReturnReason; notes?: string }): Promise<{ id: string; rmaNumber: string }> {
  const db = loose();
  const { data: order } = await db.from("orders").select("id").eq("order_number", input.orderNumber).maybeSingle();
  if (!order) throw new Error("order not found");
  const rmaNumber = `RMA-${input.orderNumber}`;
  const { data, error } = await db
    .from("returns")
    .insert({ order_id: order.id, order_number: input.orderNumber, rma_number: rmaNumber, status: "requested", reason: input.reason ?? null, notes: input.notes ?? null })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await db.from("return_events").insert({ return_id: data.id, status: "requested", description: "Return requested" });
  return { id: data.id, rmaNumber };
}

export async function transitionReturn(id: string, to: ReturnStatus, opts?: { description?: string; refundAmount?: number }): Promise<void> {
  const db = loose();
  const { data: ret } = await db.from("returns").select("status").eq("id", id).maybeSingle();
  if (!ret) throw new Error("return not found");
  assertReturnTransition(ret.status as ReturnStatus, to);
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "refund_processing" && opts?.refundAmount != null) patch.refund_amount = opts.refundAmount;
  if (to === "closed" || to === "rejected") patch.closed_at = nowIso();
  await db.from("returns").update(patch).eq("id", id);
  await db.from("return_events").insert({ return_id: id, status: to, description: opts?.description ?? null });
}

// ── §12 Business rules ────────────────────────────────────────────────────────
export async function loadBusinessRules(trigger?: string): Promise<BusinessRule[]> {
  try {
    const db = loose();
    const { data } = await db.from("business_rules").select("*").eq("active", true).order("priority");
    const rows: BusinessRule[] = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger,
      conditions: Array.isArray(r.conditions) ? r.conditions : [],
      actions: Array.isArray(r.actions) ? r.actions : [],
      priority: Number(r.priority ?? 100),
      active: Boolean(r.active),
    }));
    return trigger ? rows.filter((r) => r.trigger === trigger) : rows;
  } catch {
    return [];
  }
}

// ── §4 Courier capabilities ───────────────────────────────────────────────────
export async function loadCourierCapabilities(): Promise<CourierCapability[]> {
  try {
    const db = loose();
    const { data } = await db.from("courier_capabilities").select("*").eq("active", true);
    return (data ?? []).map((c: any) => ({
      provider: c.provider,
      courier: c.courier,
      supportsCod: Boolean(c.supports_cod),
      supportsInsurance: Boolean(c.supports_insurance),
      fragileOk: Boolean(c.fragile_ok),
      dangerousGoodsOk: Boolean(c.dangerous_goods_ok),
      maxWeightKg: c.max_weight_kg != null ? Number(c.max_weight_kg) : undefined,
      maxLengthCm: c.max_length_cm != null ? Number(c.max_length_cm) : undefined,
      pickupSlaHrs: c.pickup_sla_hrs != null ? Number(c.pickup_sla_hrs) : undefined,
      baseCost: c.base_cost != null ? Number(c.base_cost) : undefined,
      estDays: c.est_days != null ? Number(c.est_days) : undefined,
      tier: c.tier ?? "standard",
      zones: c.zones ?? undefined,
      active: Boolean(c.active),
    }));
  } catch {
    return [];
  }
}
