/**
 * Customer health — a retention verdict from purchase recency, the CRM analogue of Order/Shipment
 * health. Pure + derived (never stored), so it always reflects "now". Lets support/marketing scan the
 * list and spot who's slipping without reading each row. A customer with no paid orders is "New"
 * rather than force-scored against a purchase they never made.
 */
export type CustomerHealthKey = "new" | "healthy" | "at_risk" | "inactive" | "lost";

export interface CustomerHealth {
  key: CustomerHealthKey;
  label: string;
  tone: string; // ok | warn | over | muted — reuses the oh-badge tones
  dot: string;
  reason: string;
}

const DAY = 86_400_000;

/** Health from the last paid order. Thresholds tuned for a considered-purchase luxury cadence:
 *  ≤90d healthy, ≤180d at-risk, ≤365d inactive, older = lost. `now` injected for testability. */
export function customerHealth(lastOrderIso: string | null, paidOrders: number, now: number = Date.now()): CustomerHealth {
  if (!paidOrders || !lastOrderIso) return { key: "new", label: "New", tone: "muted", dot: "○", reason: "No completed purchase yet." };
  const days = Math.floor((now - new Date(lastOrderIso).getTime()) / DAY);
  if (days <= 90) return { key: "healthy", label: "Healthy", tone: "ok", dot: "●", reason: `Ordered ${days} day${days === 1 ? "" : "s"} ago.` };
  if (days <= 180) return { key: "at_risk", label: "At Risk", tone: "warn", dot: "▲", reason: `No order in ${days} days — worth a nudge.` };
  if (days <= 365) return { key: "inactive", label: "Inactive", tone: "over", dot: "■", reason: `No order in ${Math.round(days / 30)} months.` };
  return { key: "lost", label: "Lost", tone: "over", dot: "✕", reason: `No order in over a year (${Math.round(days / 30)} months).` };
}
