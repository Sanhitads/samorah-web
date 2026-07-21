/**
 * Shipment presentation helpers — status icons + labels and courier/provider branding. Pure lookup
 * tables shared by the board and the detail page so the visual language stays consistent. Additive:
 * the underlying status machine + provider names are unchanged; this only decorates them.
 */
import type { ShipmentStatus } from "./state";

/** Internal-status display labels (full lifecycle, admin-facing). */
export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", ready_to_ship: "Ready to Ship", shipment_created: "Created",
  courier_assigned: "Courier Assigned", label_generated: "Label Generated", pickup_scheduled: "Pickup Scheduled",
  picked_up: "Picked Up", in_transit: "In Transit", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", rto: "RTO", cancelled: "Cancelled", exception: "Exception",
};

/** A glyph per status so the board scans fast (UI-improvement request). */
export const SHIPMENT_STATUS_ICON: Record<string, string> = {
  pending: "⏳", ready_to_ship: "⏳", shipment_created: "📦", courier_assigned: "📦",
  label_generated: "🏷️", pickup_scheduled: "📦", picked_up: "🚚", in_transit: "➡️",
  out_for_delivery: "🏠", delivered: "✅", rto: "↩", cancelled: "✕", exception: "⚠",
};

export function shipmentStatusIcon(status: string): string {
  return SHIPMENT_STATUS_ICON[status] ?? "•";
}
export function shipmentStatusLabel(status: string): string {
  return SHIPMENT_STATUS_LABEL[status] ?? status;
}

/** Provider → brand label + glyph. Only `manual` exists today; the rest are wired for when a real
 *  courier integration lands, so the board is future-ready without a redesign. */
const PROVIDER_BRAND: Record<string, { label: string; icon: string }> = {
  manual: { label: "Manual Dispatch", icon: "📮" },
  shiprocket: { label: "Shiprocket", icon: "🚀" },
  bluedart: { label: "BlueDart", icon: "🟦" },
  delhivery: { label: "Delhivery", icon: "🟧" },
  dtdc: { label: "DTDC", icon: "🟥" },
  ekart: { label: "Ekart", icon: "🟩" },
};

export function providerBrand(provider: string): { label: string; icon: string } {
  return PROVIDER_BRAND[(provider ?? "").toLowerCase()] ?? { label: provider || "—", icon: "📦" };
}

/** True when the shipment moved on a real provider integration (vs a manual/self dispatch). */
export function isManualProvider(provider: string): boolean {
  return (provider ?? "").toLowerCase() === "manual";
}

export type { ShipmentStatus };
