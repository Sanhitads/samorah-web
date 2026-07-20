/**
 * Fulfillment SLA (warehouse Phase 1) — turns "order age" into an operator answer: is this order
 * on time, close to late, or late? Pure + testable; the reader computes it, the board renders it.
 *
 * Today the board shows only an age tone (24h/48h buckets). This adds a per-PRIORITY target so a VIP
 * order and a normal order are judged against different promises — 12h for a VIP is late, 12h for a
 * normal order is fine. Mirrors the incident SLA pattern (target-by-priority → due → state), but for
 * the fulfillment window (placed → ship). No schema: computed from placed_at + priority + config.
 */
import type { ManualPriority } from "./derive";

/**
 * Hours from placement to SHIP, by priority — the warehouse's promise per tier. Defaults; tune here.
 * These are deliberately conservative for a luxury brand where hand-packing takes time.
 */
export const FULFILLMENT_SLA_HRS: Record<ManualPriority, number> = {
  vip: 12,
  urgent: 12,
  high: 24,
  normal: 48,
};

/** Fraction of the target elapsed at which an order flips to "approaching". */
export const APPROACHING_AT = 0.75;

export type SlaState = "within" | "approaching" | "breached";

export interface SlaBadge {
  state: SlaState;
  label: string; // "Within SLA" | "Approaching" | "Breached"
  tone: string; // ok | warn | over — reuses the existing SLA pill tones
  targetHrs: number;
  hoursLeft: number; // negative once breached (how late)
}

/**
 * SLA state for one order. `now` is injected so the function is deterministic + testable — it never
 * reads the clock itself. An unparseable date is treated as just-placed (within SLA) rather than
 * throwing, so one bad row can't blank the board.
 */
export function fulfillmentSla(placedAtIso: string, priority: string, now: number = Date.now()): SlaBadge {
  const targetHrs = FULFILLMENT_SLA_HRS[priority as ManualPriority] ?? FULFILLMENT_SLA_HRS.normal;
  const placed = new Date(placedAtIso).getTime();
  const elapsedHrs = Number.isFinite(placed) ? Math.max(0, (now - placed) / 3.6e6) : 0;
  const hoursLeft = Math.round((targetHrs - elapsedHrs) * 10) / 10;

  if (elapsedHrs >= targetHrs) return { state: "breached", label: "Breached", tone: "over", targetHrs, hoursLeft };
  if (elapsedHrs >= targetHrs * APPROACHING_AT) return { state: "approaching", label: "Approaching", tone: "warn", targetHrs, hoursLeft };
  return { state: "within", label: "Within SLA", tone: "ok", targetHrs, hoursLeft };
}
