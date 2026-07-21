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

/** Inherit the order's priority as a shipment badge (review A / priority 1.1). Normal → no badge
 *  (noise reduction). A coloured dot makes VIP/Urgent/High pop on a busy board; `p` maps to the
 *  existing `bc-eff` data-p tones so styling is reused. */
export function shipmentPriorityBadge(priority: string | null | undefined): { label: string; p: string; dot: string } | null {
  const p = (priority ?? "normal").toLowerCase();
  if (p === "vip") return { label: "VIP", p: "critical", dot: "🔴" };
  if (p === "urgent") return { label: "Urgent", p: "critical", dot: "🟠" };
  if (p === "high") return { label: "High", p: "high", dot: "🟡" };
  return null;
}

/** The five customer-facing tracking milestones for the progress bar (review priority 2.5). */
export const TRACK_STEPS = ["Created", "Picked Up", "In Transit", "Out for Delivery", "Delivered"];

// status → milestone index (0–4). Negatives are branch states handled specially by the bar.
const STEP_OF: Record<string, number> = {
  pending: 0, ready_to_ship: 0, shipment_created: 0, courier_assigned: 0, label_generated: 0, pickup_scheduled: 0,
  picked_up: 1, in_transit: 2, out_for_delivery: 3, delivered: 4,
  exception: -1, rto: -2, cancelled: -3,
};
export function trackingStep(status: string): number {
  return STEP_OF[status] ?? 0;
}

/** Courier support numbers (review priority 3.11) — surfaced on the detail page so staff aren't
 *  hunting during an exception. Static + future-ready; manual dispatch has none. */
const COURIER_SUPPORT: Record<string, string> = {
  bluedart: "1860-233-1234",
  delhivery: "011-4719-4719",
  dtdc: "1800-123-4444",
  ekart: "1800-420-1111",
  shiprocket: "1800-419-7332",
};
export function courierSupport(courier: string | null, provider: string): string | null {
  const key = (courier ?? provider ?? "").toLowerCase().replace(/\s+/g, "");
  for (const [k, num] of Object.entries(COURIER_SUPPORT)) if (key.includes(k)) return num;
  return null;
}

/** Damage-risk hint from the order's contents (review priority 3.9). Samorah parcels are glass/ceramic
 *  candles → "Fragile"; terracotta/ceramic vessels → "Extra Fragile". A heuristic over item vessel /
 *  name, so the bench handles the box accordingly. */
export function damageRisk(items: { product_name?: string | null; vessel?: string | null }[]): { label: string; level: "fragile" | "extra" } | null {
  if (!items.length) return null;
  const txt = items.map((i) => `${i.product_name ?? ""} ${i.vessel ?? ""}`).join(" ").toLowerCase();
  if (/terracotta|ceramic|clay|porcelain/.test(txt)) return { label: "Extra Fragile", level: "extra" };
  if (/candle|glass|jar|vessel/.test(txt) || items.length) return { label: "Fragile", level: "fragile" };
  return null;
}

export type { ShipmentStatus };
