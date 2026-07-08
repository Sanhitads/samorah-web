/**
 * Shipment service — turns a persisted ORDER into a shipment through the shipping
 * abstraction (never a specific courier). Builds a ShipmentRequest from the order
 * snapshot, asks the active provider to create the shipment, then persists the
 * shipment + first tracking event. `buildShipmentRequest` is pure (unit-tested).
 */
import { getOrderById } from "@/services/orderService";
import { getShippingProvider } from "@/lib/shipping";
import type { ShipmentRequest } from "@/lib/shipping/types";
import { toCustomerStatus, type ShipmentStatus } from "@/lib/shipment/state";
import { DEFAULT_WAREHOUSE, DEFAULT_PARCEL, volumetricWeightKg, chargeableWeightKg } from "@/config/logistics";
import { callRpc } from "@/lib/supabase/rpc";

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
  order_items?: { product_name: string; sku: string; quantity: number; unit_price: number | string; hsn_code?: string | null }[];
}

const n = (v: unknown) => Number(v ?? 0);

/** Build the provider-agnostic shipment request from the order snapshot. Parcel
 *  weight/dimensions come from the Packaging Engine later; today from defaults. */
export function buildShipmentRequest(order: ShippableOrder): ShipmentRequest {
  const items = (order.order_items ?? []).map((it) => ({
    name: it.product_name,
    sku: it.sku,
    quantity: it.quantity,
    unitPriceInr: n(it.unit_price),
    hsn: it.hsn_code ?? undefined,
  }));
  return {
    referenceId: order.order_number,
    pickup: DEFAULT_WAREHOUSE,
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
    parcel: {
      weightKg: chargeableWeightKg(DEFAULT_PARCEL.weightKg, DEFAULT_PARCEL.dimensions),
      dimensions: DEFAULT_PARCEL.dimensions,
      items,
      declaredValueInr: n(order.total_amount),
    },
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

/** Create + persist a shipment for an order (idempotent). Uses the active provider. */
export async function createShipmentForOrder(orderId: string): Promise<ShipmentCreateResult> {
  const order = (await getOrderById(orderId)) as unknown as ShippableOrder | null;
  if (!order) return { ok: false, created: false, reason: "order not found" };

  const req = buildShipmentRequest(order);
  const provider = getShippingProvider();
  const shipment = await provider.createShipment(req);
  if (!shipment.ok) return { ok: false, created: false, reason: shipment.reason ?? "provider failed" };

  const dims = DEFAULT_PARCEL.dimensions;
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
      shipping_weight_kg: String(DEFAULT_PARCEL.weightKg),
      volumetric_weight_kg: String(volumetricWeightKg(dims)),
      chargeable_weight_kg: String(req.parcel.weightKg),
      length_cm: String(dims.lengthCm),
      width_cm: String(dims.widthCm),
      height_cm: String(dims.heightCm),
      declared_value: String(req.parcel.declaredValueInr),
      shipping_cost: String(n(order.shipping_amount)),
    },
  });

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
