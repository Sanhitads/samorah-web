/**
 * Shipping Engine — the common vocabulary every provider speaks. Fulfillment code
 * depends on these types + the ShippingProvider interface, NEVER on a courier SDK.
 * Adding Shiprocket/Delhivery later means implementing the interface with these
 * types — no change to order/fulfillment logic.
 */
export type PaymentMode = "prepaid" | "cod";
export type ProviderName = "manual" | "shiprocket" | "delhivery" | "bluedart" | "indiapost";

export interface ShipmentAddress {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

/** External box dimensions (couriers charge on these). */
export interface ParcelDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface ParcelItem {
  name: string;
  sku: string;
  quantity: number;
  unitPriceInr: number;
  hsn?: string;
}

export interface Parcel {
  weightKg: number; // chargeable weight (max of shipping + volumetric)
  dimensions: ParcelDimensions;
  items: ParcelItem[];
  declaredValueInr: number;
}

/** A dynamic pickup location (warehouse) — an order decides which fulfils it. */
export interface PickupLocation {
  id: string;
  name: string;
  address: ShipmentAddress;
  gstin?: string;
}

export interface RateRequest {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  paymentMode: PaymentMode;
  declaredValueInr: number;
}

export interface RateQuote {
  provider: ProviderName;
  courierName: string;
  serviceable: boolean;
  estimatedCostInr: number;
  estimatedDays?: number;
  codAvailable: boolean;
}

export interface ShipmentRequest {
  referenceId: string; // the order number
  pickup: PickupLocation;
  delivery: ShipmentAddress;
  parcel: Parcel;
  paymentMode: PaymentMode;
  codAmountInr?: number;
}

export interface ShipmentResult {
  ok: boolean;
  provider: ProviderName;
  providerShipmentId?: string;
  awb?: string;
  courierName?: string;
  trackingUrl?: string;
  labelUrl?: string;
  reason?: string;
}

export interface TrackingEvent {
  at: string; // ISO
  status: string; // raw provider status
  description: string;
  location?: string;
}
export interface TrackingResult {
  ok: boolean;
  status: string;
  events: TrackingEvent[];
  awb?: string;
  reason?: string;
}

export interface SimpleResult {
  ok: boolean;
  reason?: string;
}
export interface LabelResult {
  ok: boolean;
  labelUrl?: string;
  reason?: string;
}
export interface PickupResult {
  ok: boolean;
  pickupId?: string;
  scheduledFor?: string;
  reason?: string;
}
