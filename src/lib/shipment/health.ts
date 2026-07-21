/**
 * Shipment health — a single at-a-glance verdict per parcel, the shipping analogue of Order Health.
 * Pure + derived from state we already load (status, exception, age, delivery), never stored. Lets an
 * operator scan a 200-row board and spot the parcels that need attention without reading each one.
 */
export type ShipmentHealthTone = "ok" | "warn" | "over" | "muted";

export interface ShipmentHealth {
  key: "healthy" | "delivered" | "delayed" | "exception" | "lost" | "rto" | "returned" | "cancelled";
  label: string;
  tone: ShipmentHealthTone;
  dot: string; // small status glyph
  reason: string; // tooltip
}

const DAY = 86_400_000;

/**
 * Verdict for one shipment. `slaBreached` is passed in (computed once by the SLA helper) so the two
 * stay consistent. "Lost" is inferred, not tracked: a parcel stuck in `exception` well past the
 * transit target is very likely lost — surfaced so it gets chased rather than silently ageing.
 */
export function shipmentHealth(input: {
  status: string;
  exceptionReason: string | null;
  createdAt: string;
  deliveredAt: string | null;
  slaBreached: boolean;
  now?: number;
}): ShipmentHealth {
  const now = input.now ?? Date.now();
  const ageDays = Math.max(0, (now - new Date(input.createdAt).getTime()) / DAY);

  if (input.status === "delivered") return { key: "delivered", label: "Delivered", tone: "ok", dot: "✅", reason: "Delivered to the customer." };
  if (input.status === "rto") return { key: "rto", label: "RTO", tone: "over", dot: "↩", reason: "Return to origin — parcel came back." };
  if (input.status === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "muted", dot: "✕", reason: "Shipment cancelled before delivery." };

  // Any undelivered parcel past ~10 days reads as likely lost — escalate to a claim, don't let it age
  // silently as merely "delayed" (review priority 2.7).
  if (ageDays >= 10) return { key: "lost", label: "Likely Lost", tone: "over", dot: "❓", reason: `${Math.floor(ageDays)} days and not delivered — likely lost, raise a courier claim.` };

  if (input.status === "exception") return { key: "exception", label: "Exception", tone: "warn", dot: "⚠", reason: input.exceptionReason || "Delivery exception (NDR) — needs a re-attempt or RTO." };
  if (input.slaBreached) return { key: "delayed", label: "Delayed", tone: "warn", dot: "⏱", reason: "Past the delivery SLA and still in transit." };
  return { key: "healthy", label: "Healthy", tone: "ok", dot: "•", reason: "On track, within the delivery SLA." };
}
