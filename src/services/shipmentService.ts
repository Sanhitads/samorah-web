/**
 * Shipment service — turns a persisted ORDER into a shipment through the shipping
 * abstraction (never a specific courier). Builds a ShipmentRequest from the order
 * snapshot, asks the active provider to create the shipment, then persists the
 * shipment + first tracking event. `buildShipmentRequest` is pure (unit-tested).
 */
import { getOrderById } from "@/services/orderService";
import { getShippingProvider } from "@/lib/shipping";
import type { ProviderName, ShipmentRequest, PickupLocation } from "@/lib/shipping/types";
import { routeWarehouseForOrder } from "@/services/warehouseService";
import { toCustomerStatus, assertShipmentTransition, nextShipmentStates, type ShipmentStatus } from "@/lib/shipment/state";
import { fulfillmentReadyToShip, type FulfillmentStatus } from "@/lib/fulfillment/state";
import {
  DEFAULT_WAREHOUSE,
  DEFAULT_PARCEL,
  volumetricWeightKg,
  chargeableWeightKg,
  LOGISTICS_INSURANCE_RATE_PCT,
  LOGISTICS_TAX_PCT,
  PLACEHOLDER_NET_WEIGHT_G,
} from "@/config/logistics";
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { packOrder } from "@/lib/packaging/engine";
import type { PackContext, PackedParcel } from "@/lib/packaging/types";
import { EXAMPLE_PACKAGING_CATALOG } from "@/config/packaging";
import { getPackagingCatalog } from "@/services/packagingService";
import { computeLogisticsCost } from "@/lib/logistics/cost";
import { getShippingSettings } from "@/lib/settings/shippingSettings";
import { loadBusinessRules } from "@/services/logisticsService";
import { runBusinessRules } from "@/lib/rules/engine";
import { logEvent } from "@/services/auditService";

/** Loose admin accessor for the shipments/* tables (not in generated DB types). */
function adminLoose() {
  return createAdminClient() as unknown as {
    from: (t: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (q?: string) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (v: Record<string, unknown>) => any;
    };
  };
}

/** The order fields the shipping layer needs (loose — decoupled from DB types). */
export interface ShippableOrder {
  order_number: string;
  email?: string | null;
  ship_full_name?: string | null;
  ship_phone?: string | null;
  ship_line1?: string | null;
  ship_line2?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_pincode?: string | null;
  total_amount?: number | string | null;
  shipping_amount?: number | string | null;
  fulfillment_status?: string | null;
  order_items?: {
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: number | string;
    hsn_code?: string | null;
    vessel?: string | null;
    variant_name?: string | null;
  }[];
}

const n = (v: unknown) => Number(v ?? 0);

/** Infer a product type for packaging rules from the line snapshot. */
function inferProductType(it: { product_name: string; variant_name?: string | null }): string {
  const s = `${it.product_name} ${it.variant_name ?? ""}`.toLowerCase();
  if (s.includes("linen")) return "linen_spray";
  if (s.includes("spray") || s.includes("room")) return "room_spray";
  return "candle";
}

/** Derive the Packaging Engine context from the order snapshot. Net weights are a
 *  placeholder until real per-variant data lands (§3/§6). */
export function buildPackContext(order: ShippableOrder): PackContext {
  const items = order.order_items ?? [];
  const productCount = items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  const productTypes = [...new Set(items.map(inferProductType))];
  const vessels = [...new Set(items.map((i) => (i.vessel ?? "").toLowerCase()).filter(Boolean))];
  return {
    productCount: Math.max(1, productCount),
    productTypes,
    vessels,
    isGift: false, // gift flag wired when checkout captures it
    netWeightsG: Array(Math.max(1, productCount)).fill(PLACEHOLDER_NET_WEIGHT_G),
  };
}

/** Build the provider-agnostic shipment request. Parcel weight/dimensions now come
 *  from the Packaging Engine (placeholder catalog until real measurements land),
 *  falling back to DEFAULT_PARCEL if no profile matches. */
export function buildShipmentRequest(order: ShippableOrder, parcel?: PackedParcel | null, pickup?: PickupLocation | null): ShipmentRequest {
  const items = (order.order_items ?? []).map((it) => ({
    name: it.product_name,
    sku: it.sku,
    quantity: it.quantity,
    unitPriceInr: n(it.unit_price),
    hsn: it.hsn_code ?? undefined,
  }));
  const packed = parcel ?? packOrder(buildPackContext(order), EXAMPLE_PACKAGING_CATALOG);
  const dimensions = packed?.dimensions ?? DEFAULT_PARCEL.dimensions;
  const weightKg = packed?.chargeableWeightKg ?? chargeableWeightKg(DEFAULT_PARCEL.weightKg, DEFAULT_PARCEL.dimensions);
  return {
    referenceId: order.order_number,
    pickup: pickup ?? DEFAULT_WAREHOUSE,
    delivery: {
      name: order.ship_full_name ?? "",
      phone: order.ship_phone ?? "",
      email: order.email ?? undefined,
      line1: order.ship_line1 ?? "",
      line2: order.ship_line2 ?? undefined,
      city: order.ship_city ?? "",
      state: order.ship_state ?? "",
      pincode: order.ship_pincode ?? "",
      country: "India",
    },
    parcel: { weightKg, dimensions, items, declaredValueInr: n(order.total_amount) },
    paymentMode: "prepaid", // all orders prepaid via Razorpay today; COD is a later slice
  };
}

export interface ShipmentCreateResult {
  ok: boolean;
  created: boolean;
  shipmentId?: string;
  awb?: string;
  orderNumber?: string;
  reason?: string;
}

/** Create + persist a shipment for an order (idempotent). Wires: shipping settings
 *  (§11) → provider; Packaging Engine (§3/§6) → parcel; Business Rules (§12) →
 *  insurance/flags; Cost Engine (§9) → persisted logistics cost. Provider-agnostic. */
export async function createShipmentForOrder(orderId: string, opts?: { actorId?: string }): Promise<ShipmentCreateResult> {
  const order = (await getOrderById(orderId)) as unknown as (ShippableOrder & { fulfillment_status?: string | null }) | null;
  if (!order) return { ok: false, created: false, reason: "order not found" };

  const settings = await getShippingSettings();

  // §14 gate — when enabled, only ship once fulfillment reaches ready_for_dispatch.
  if (settings.autoCreateAfterFulfillment) {
    const fs = (order.fulfillment_status ?? "reserved") as FulfillmentStatus;
    if (!fulfillmentReadyToShip(fs)) {
      return { ok: false, created: false, reason: "deferred: awaiting fulfillment" };
    }
  }

  // §3/§6 packaging → parcel (weights/dims/packaging cost). Uses the ADMIN-managed
  // catalog from the DB (falls back to the config example until it's seeded).
  const catalog = await getPackagingCatalog();
  const parcel = packOrder(buildPackContext(order), catalog);

  // §G routing → which warehouse fulfils this order (region routing over the DB).
  const pickup = await routeWarehouseForOrder({ ship_state: order.ship_state });
  const req = buildShipmentRequest(order, parcel, pickup);

  // §12 business rules → actions (e.g. add_insurance, set_courier).
  const rules = await loadBusinessRules("order.created");
  const actions = runBusinessRules(rules, "order.created", {
    order: {
      total: req.parcel.declaredValueInr,
      state: order.ship_state,
      city: order.ship_city,
      payment: req.paymentMode,
      types: buildPackContext(order).productTypes,
    },
  });
  const ruleInsured = actions.some((a) => a.type === "add_insurance");
  const forcedProvider = actions.find((a) => a.type === "set_provider")?.value as ProviderName | undefined;

  // §11 settings → provider (a business rule may override).
  const providerName = forcedProvider ?? (settings.defaultProvider as ProviderName);
  const provider = getShippingProvider(providerName);

  const shipment = await provider.createShipment(req);
  if (!shipment.ok) return { ok: false, created: false, reason: shipment.reason ?? "provider failed" };

  const dims = req.parcel.dimensions;
  const status: ShipmentStatus = shipment.awb ? "courier_assigned" : "shipment_created";
  const data = await callRpc<{ shipment_id: string; created: boolean; order_number: string }>("create_shipment", {
    p: {
      order_id: orderId,
      warehouse_id: req.pickup.id,
      provider: shipment.provider,
      status,
      customer_status: toCustomerStatus(status),
      description: shipment.awb
        ? `Shipment created · ${shipment.courierName ?? shipment.provider} · AWB ${shipment.awb}`
        : "Shipment created",
      provider_shipment_id: shipment.providerShipmentId ?? "",
      awb: shipment.awb ?? "",
      courier_name: shipment.courierName ?? "",
      tracking_url: shipment.trackingUrl ?? "",
      label_url: shipment.labelUrl ?? "",
      payment_mode: req.paymentMode,
      cod_amount: String(req.codAmountInr ?? 0),
      shipping_weight_kg: String(parcel?.shippingWeightKg ?? DEFAULT_PARCEL.weightKg),
      volumetric_weight_kg: String(parcel?.volumetricWeightKg ?? volumetricWeightKg(dims)),
      chargeable_weight_kg: String(req.parcel.weightKg),
      length_cm: String(dims.lengthCm),
      width_cm: String(dims.widthCm),
      height_cm: String(dims.heightCm),
      declared_value: String(req.parcel.declaredValueInr),
      shipping_cost: String(n(order.shipping_amount)),
    },
  });

  // §9 cost engine → persist the logistics cost breakdown onto the shipment.
  try {
    const estimate = await provider.estimateShipping({
      pickupPincode: req.pickup.address.pincode,
      deliveryPincode: req.delivery.pincode,
      weightKg: req.parcel.weightKg,
      paymentMode: req.paymentMode,
      declaredValueInr: req.parcel.declaredValueInr,
    });
    const insured = ruleInsured || settings.fragilePolicy === "always" || req.parcel.declaredValueInr >= settings.insuranceThreshold;
    const cost = computeLogisticsCost({
      courierCost: estimate[0]?.estimatedCostInr ?? 0,
      packagingCost: parcel?.estimatedPackagingCostInr ?? 0,
      declaredValueInr: req.parcel.declaredValueInr,
      insured,
      insuranceRatePct: LOGISTICS_INSURANCE_RATE_PCT,
      cod: req.paymentMode === "cod",
      taxPct: LOGISTICS_TAX_PCT,
    });
    await adminLoose()
      .from("shipments")
      .update({
        net_weight_kg: parcel?.netWeightKg ?? null,
        packaging_weight_kg: parcel?.packagingWeightKg ?? null,
        courier_cost: cost.courierCost,
        packaging_cost: cost.packagingCost,
        insurance_cost: cost.insurance,
        cod_fee: cost.codFee,
        fuel_surcharge: cost.fuelSurcharge,
        tax_cost: cost.tax,
        total_logistics_cost: cost.total,
        insured,
      })
      .eq("id", data.shipment_id);
  } catch (e) {
    console.error("shipment cost persist failed (non-fatal)", e);
  }

  if (data.created) {
    await logEvent({
      orderId,
      entityType: "shipment",
      entityId: data.shipment_id,
      event: "shipment.created",
      actorId: opts?.actorId,
      newState: status,
      notes: shipment.awb ? `${shipment.courierName ?? shipment.provider} · ${shipment.awb}` : undefined,
      metadata: { provider: shipment.provider, awb: shipment.awb ?? null, courier: shipment.courierName ?? null },
    });
  }

  return { ok: true, created: data.created, shipmentId: data.shipment_id, awb: shipment.awb, orderNumber: data.order_number };
}

/** Append a tracking event + advance the shipment status (Tracking Engine writes). */
export async function addShipmentEvent(
  shipmentId: string,
  status: ShipmentStatus,
  opts?: { description?: string; location?: string; source?: "system" | "provider" | "admin" },
): Promise<void> {
  await callRpc<void>("add_shipment_event", {
    p: {
      shipment_id: shipmentId,
      status,
      customer_status: toCustomerStatus(status),
      description: opts?.description ?? "",
      location: opts?.location ?? "",
      source: opts?.source ?? "system",
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The order + shipment + event timeline for the customer tracking page. */
export async function getShipmentForOrderNumber(orderNumber: string): Promise<{ order: any; shipment: any } | null> {
  const db = adminLoose();
  const { data: order } = await db
    .from("orders")
    .select("id,order_number,status,email,ship_full_name,ship_line1,ship_line2,ship_city,ship_state,ship_pincode,ship_phone")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return null;
  const { data: shipment } = await db
    .from("shipments")
    .select("*, shipment_events(*)")
    .eq("order_id", order.id)
    .maybeSingle();
  return { order, shipment };
}

export interface DispatchInfo {
  order_number: string;
  ship_full_name: string | null;
  email: string;
  courier_name: string | null;
  awb: string | null;
}
/** Minimal data for the ORDER_DISPATCHED email. */
export async function getDispatchInfo(orderId: string): Promise<DispatchInfo | null> {
  const db = adminLoose();
  const { data: order } = await db.from("orders").select("order_number,ship_full_name,email").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: shipment } = await db.from("shipments").select("awb,courier_name").eq("order_id", orderId).maybeSingle();
  return {
    order_number: order.order_number,
    ship_full_name: order.ship_full_name ?? null,
    email: order.email,
    courier_name: shipment?.courier_name ?? null,
    awb: shipment?.awb ?? null,
  };
}

/** Mark a shipment dispatched (picked up), advance the order → shipped, queue the
 *  dispatch email. Admin/manual action today; a provider webhook later. */
export async function markShipmentDispatched(orderId: string, opts?: { actorId?: string }): Promise<{ ok: boolean; reason?: string }> {
  const db = adminLoose();
  const { data: shipment } = await db.from("shipments").select("id,status").eq("order_id", orderId).maybeSingle();
  if (!shipment) return { ok: false, reason: "no shipment for order" };
  await addShipmentEvent(shipment.id, "picked_up", { description: "Dispatched — parcel handed to courier", source: "admin" });
  await db.from("orders").update({ status: "shipped" }).eq("id", orderId);
  await callRpc<void>("queue_fulfillment_job", { p_order_id: orderId, p_job_type: "dispatch_email" });
  await logEvent({ orderId, entityType: "shipment", entityId: shipment.id, event: "shipment.dispatched", actorId: opts?.actorId, previousState: shipment.status, newState: "picked_up" });
  return { ok: true };
}

// ── Post-dispatch lifecycle (Shipment Management) ────────────────────────────

/** Lazy notify (breaks the shipmentService → engine → channel → shipmentService cycle). */
async function emitShipmentEvent(event: "delivery.completed", orderId: string): Promise<void> {
  try {
    const { notify } = await import("@/lib/notifications/engine");
    await notify(event, { orderId });
  } catch (e) {
    console.error("shipment notify failed", e);
  }
}

export interface ShipmentAdvanceOpts {
  actorId?: string;
  description?: string;
  location?: string;
  recipient?: string; // POD — who received it
  reason?: string; // exception / NDR reason
  source?: "system" | "provider" | "admin"; // event origin (webhook = provider)
}

/**
 * Advance a shipment through its state machine (guarded). Handles the real
 * scenarios beyond dispatch: in_transit, out_for_delivery, delivered (+POD +
 * delivery email + order→delivered), exception/NDR (+reason), and RTO
 * (+order→rto). Called by admin actions and by the courier webhook.
 */
export async function advanceShipment(shipmentId: string, to: ShipmentStatus, opts?: ShipmentAdvanceOpts): Promise<{ ok: boolean; from?: ShipmentStatus; to?: ShipmentStatus; reason?: string }> {
  const db = adminLoose();
  const { data: sh } = await db.from("shipments").select("id,order_id,status").eq("id", shipmentId).maybeSingle();
  if (!sh) return { ok: false, reason: "shipment_not_found" };
  const from = sh.status as ShipmentStatus;
  assertShipmentTransition(from, to);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "delivered") {
    patch.delivered_at = now;
    if (opts?.recipient) patch.delivered_to = opts.recipient;
    if (opts?.description) patch.pod_note = opts.description;
  }
  if (to === "exception") patch.exception_reason = opts?.reason ?? opts?.description ?? null;
  if (to === "rto") patch.rto_at = now;
  if (to === "cancelled") patch.cancelled_at = now;
  await db.from("shipments").update(patch).eq("id", shipmentId);

  await addShipmentEvent(shipmentId, to, {
    description: opts?.description ?? opts?.reason,
    location: opts?.location,
    source: opts?.source ?? "admin",
  });

  // Order-level sync only for the meaningful outcomes (order stays 'shipped' through transit).
  if (to === "delivered") await db.from("orders").update({ status: "delivered" }).eq("id", sh.order_id);
  if (to === "rto") await db.from("orders").update({ status: "rto" }).eq("id", sh.order_id);

  await logEvent({
    orderId: sh.order_id,
    entityType: "shipment",
    entityId: shipmentId,
    event: `shipment.${to}`,
    actorId: opts?.actorId,
    previousState: from,
    newState: to,
    notes: opts?.reason ?? opts?.description,
  });

  if (to === "delivered") await emitShipmentEvent("delivery.completed", sh.order_id);
  return { ok: true, from, to };
}

/** Cancel a shipment (pre-pickup) — asks the provider, then records it. */
export async function cancelShipment(shipmentId: string, opts?: { actorId?: string; reason?: string }): Promise<{ ok: boolean; reason?: string }> {
  const db = adminLoose();
  const { data: sh } = await db.from("shipments").select("id,order_id,status,provider,provider_shipment_id").eq("id", shipmentId).maybeSingle();
  if (!sh) return { ok: false, reason: "shipment_not_found" };
  if (sh.provider_shipment_id) {
    try {
      await getShippingProvider(sh.provider as ProviderName).cancelShipment(sh.provider_shipment_id);
    } catch (e) {
      console.error("provider cancel failed", e); // still record the cancel locally
    }
  }
  return advanceShipment(shipmentId, "cancelled", { actorId: opts?.actorId, reason: opts?.reason });
}

/** (Re)generate the shipping label through the provider and store the URL. */
export async function regenerateLabel(shipmentId: string): Promise<{ ok: boolean; labelUrl?: string; reason?: string }> {
  const db = adminLoose();
  const { data: sh } = await db.from("shipments").select("id,provider,provider_shipment_id").eq("id", shipmentId).maybeSingle();
  if (!sh) return { ok: false, reason: "shipment_not_found" };
  if (!sh.provider_shipment_id) return { ok: false, reason: "no provider shipment id" };
  const res = await getShippingProvider(sh.provider as ProviderName).generateLabel(sh.provider_shipment_id);
  if (!res.ok || !res.labelUrl) return { ok: false, reason: res.reason ?? "label failed" };
  await db.from("shipments").update({ label_url: res.labelUrl, updated_at: new Date().toISOString() }).eq("id", shipmentId);
  return { ok: true, labelUrl: res.labelUrl };
}

export interface ShipmentRow {
  id: string;
  orderNumber: string;
  provider: string;
  status: ShipmentStatus;
  customerStatus: string;
  courierName: string | null;
  awb: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  chargeableWeightKg: number | null;
  shippingCost: number | null;
  exceptionReason: string | null;
  hasProviderShipmentId: boolean;
  nextStates: ShipmentStatus[];
  createdAt: string;
}

/** Shipments for the admin module, newest first (optionally filtered by status). */
export async function getShipmentsQueue(opts: { limit?: number; status?: ShipmentStatus } = {}): Promise<ShipmentRow[]> {
  const db = adminLoose();
  let q = db
    .from("shipments")
    .select("id,status,provider,provider_shipment_id,courier_name,awb,tracking_url,label_url,chargeable_weight_kg,shipping_cost,exception_reason,created_at,orders(order_number)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((s: any) => {
    const o = Array.isArray(s.orders) ? s.orders[0] : s.orders;
    const status = s.status as ShipmentStatus;
    return {
      id: s.id,
      orderNumber: o?.order_number ?? "",
      provider: s.provider,
      status,
      customerStatus: toCustomerStatus(status),
      courierName: s.courier_name ?? null,
      awb: s.awb ?? null,
      trackingUrl: s.tracking_url ?? null,
      labelUrl: s.label_url ?? null,
      chargeableWeightKg: s.chargeable_weight_kg != null ? Number(s.chargeable_weight_kg) : null,
      shippingCost: s.shipping_cost != null ? Number(s.shipping_cost) : null,
      exceptionReason: s.exception_reason ?? null,
      hasProviderShipmentId: Boolean(s.provider_shipment_id),
      nextStates: nextShipmentStates(status),
      createdAt: s.created_at,
    };
  });
}

/** Minimal data for the ORDER_DELIVERED email. */
export async function getDeliveryInfo(orderId: string): Promise<{ order_number: string; ship_full_name: string | null; email: string; delivered_to: string | null } | null> {
  const db = adminLoose();
  const { data: order } = await db.from("orders").select("order_number,ship_full_name,email").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: shipment } = await db.from("shipments").select("delivered_to").eq("order_id", orderId).maybeSingle();
  return { order_number: order.order_number, ship_full_name: order.ship_full_name ?? null, email: order.email, delivered_to: shipment?.delivered_to ?? null };
}

/** Resolve a shipment id from an AWB (courier webhook keys on AWB). */
export async function getShipmentIdByAwb(awb: string): Promise<string | null> {
  const db = adminLoose();
  const { data } = await db.from("shipments").select("id").eq("awb", awb).maybeSingle();
  return data?.id ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
