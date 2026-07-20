/**
 * Board derivations (review points 2, 3, 5, 10) — pure functions turning raw order
 * state into the signals a warehouse operator reads without interpreting. Kept
 * pure + testable; the reader calls these, the UI just renders the result.
 */
import type { FulfillmentStatus } from "./state";

export type ManualPriority = "normal" | "high" | "urgent" | "vip";
export type EffectivePriority = "normal" | "high" | "critical";
export type SlaTone = "ok" | "warn" | "over";
export type WorkQueue = "pick" | "pack" | "ship" | "exceptions" | "hold";
export type InventorySignal = "reserved" | "allocated" | "picking" | "missing" | "backordered" | "unknown";

export const EFFECTIVE_RANK: Record<EffectivePriority, number> = { critical: 0, high: 1, normal: 2 };

/**
 * Effective Priority = max(manual, computed). Staff can always force something up
 * (VIP/Urgent → Critical); SLA breach and operational tags escalate on their own so
 * nobody has to reason about it. Manual override never lowers a computed escalation.
 */
export function effectivePriority(manual: ManualPriority, opts: { slaTone: SlaTone; tags: string[] }): EffectivePriority {
  const tags = opts.tags ?? [];
  if (manual === "vip" || manual === "urgent" || opts.slaTone === "over" || tags.includes("Complaint")) return "critical";
  if (manual === "high" || opts.slaTone === "warn" || tags.includes("Express") || tags.includes("Replacement")) return "high";
  return "normal";
}

/** Which functional queue this row belongs to (principle 10) — a predicate, no storage. */
export function queueOf(fs: FulfillmentStatus, inventory: InventorySignal): WorkQueue {
  if (fs === "on_hold") return "hold";
  if (fs === "qc_failed" || inventory === "missing") return "exceptions";
  if (fs === "reserved" || fs === "picking") return "pick";
  if (fs === "picked" || fs === "packing" || fs === "packed" || fs === "qc_passed") return "pack";
  // ready_for_dispatch / courier_assigned / picked_up / shipped
  return "ship";
}

export const WORK_QUEUES: { key: WorkQueue; label: string }[] = [
  { key: "pick", label: "Ready to Pick" },
  { key: "pack", label: "Ready to Pack" },
  { key: "ship", label: "Ready to Ship" },
  { key: "exceptions", label: "Blocked" }, // QC-failed / out-of-stock — distinct from On Hold
  { key: "hold", label: "On Hold" },
];

/** The single next step for a row — so the board states it rather than making staff infer it. */
export function nextActionLabel(fs: FulfillmentStatus, shipmentStatus: string | null): string {
  switch (fs) {
    case "reserved": return "Start picking";
    case "picking": return "Mark picked";
    case "picked": return "Start packing";
    case "packing": return "Mark packed";
    case "packed": return "Pass QC";
    case "qc_passed": return "Mark ready";
    case "qc_failed": return "Rework";
    case "ready_for_dispatch": return shipmentStatus ? "Dispatch" : "Create shipment";
    case "courier_assigned": return "Dispatch";
    case "picked_up":
    case "shipped": return "In transit";
    case "on_hold": return "Resume";
    default: return "—";
  }
}

/** Refund sub-state for the payment badge (review point 4), from the ledger + summary. */
export type RefundState = "none" | "initiated" | "processing" | "partial" | "refunded";
export function refundBadge(paymentStatus: string, latestRefundStatus: string | null): { label: string; tone: string } | null {
  if (paymentStatus === "refunded") return { label: "Refunded", tone: "refunded" };
  if (latestRefundStatus === "initiated") return { label: "Refund Initiated", tone: "refundprog" };
  if (latestRefundStatus === "processing") return { label: "Refund Processing", tone: "refundprog" };
  if (paymentStatus === "partially_refunded") return { label: "Part. Refunded", tone: "refunded" };
  return null; // no refund dimension → caller shows the base payment badge
}
