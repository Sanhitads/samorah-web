/**
 * Manual (self-ship) provider — a first-class ShippingProvider with NO external
 * dependency. Samorah can launch and operate entirely on this: you pack and hand
 * to any local courier, and the shipment/tracking still flow through the platform
 * (status updated by admin). Swapping to Shiprocket later changes only which
 * provider the factory returns — not this contract.
 */
import { SHIPPING } from "@/config/commerce";
import type { ShippingProvider } from "../provider";
import type {
  ProviderName,
  RateRequest,
  RateQuote,
  ShipmentRequest,
  ShipmentResult,
  TrackingResult,
  SimpleResult,
  LabelResult,
  PickupResult,
} from "../types";

export class ManualShippingProvider implements ShippingProvider {
  readonly name: ProviderName = "manual";
  readonly configured = true; // always available — no creds, no external API

  async estimateShipping(req: RateRequest): Promise<RateQuote[]> {
    // Samorah's own rate policy (free over threshold, else flat) — no courier call.
    const free = req.declaredValueInr >= SHIPPING.freeThreshold;
    return [
      {
        provider: this.name,
        courierName: "Manual Dispatch",
        serviceable: true,
        estimatedCostInr: free ? 0 : SHIPPING.flatRate,
        codAvailable: true,
      },
    ];
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResult> {
    // Deterministic internal references (no external AWB). The parcel is dispatched
    // by hand; the customer tracks via their order/tracking page.
    return {
      ok: true,
      provider: this.name,
      providerShipmentId: `MAN-${req.referenceId}`,
      awb: `MANUAL-${req.referenceId}`,
      courierName: "Manual Dispatch",
    };
  }

  async cancelShipment(): Promise<SimpleResult> {
    return { ok: true };
  }

  async trackShipment(awbOrId: string): Promise<TrackingResult> {
    // Manual shipments have no courier feed — status is driven by admin updates on
    // the shipment record; return an empty timeline with the awb echoed.
    return { ok: true, status: "manual", events: [], awb: awbOrId, reason: "Manual dispatch — status updated by Samorah" };
  }

  async generateLabel(): Promise<LabelResult> {
    return { ok: true, reason: "Manual dispatch — print your own label / packing slip" };
  }

  async schedulePickup(): Promise<PickupResult> {
    return { ok: true, reason: "Manual dispatch — pickup/drop-off arranged by Samorah" };
  }
}
