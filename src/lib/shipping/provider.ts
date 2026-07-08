/**
 * ShippingProvider — the stable contract. Manual, Shiprocket, Delhivery, Blue Dart,
 * India Post, and any future courier/ERP each implement THIS. The rest of Samorah
 * (fulfillment, tracking, notifications) talks only to this interface, so a provider
 * is a replaceable component, not a dependency.
 */
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
} from "./types";

export interface ShippingProvider {
  readonly name: ProviderName;
  /** True when the provider can operate (creds present / no external dep). */
  readonly configured: boolean;

  estimateShipping(req: RateRequest): Promise<RateQuote[]>;
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
  cancelShipment(providerShipmentId: string): Promise<SimpleResult>;
  trackShipment(awbOrId: string): Promise<TrackingResult>;
  generateLabel(providerShipmentId: string): Promise<LabelResult>;
  schedulePickup(providerShipmentId: string): Promise<PickupResult>;
}
