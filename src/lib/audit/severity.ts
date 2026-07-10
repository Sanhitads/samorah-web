/**
 * Activity colour coding (OS spec Point 18): map an event to a severity so the
 * feed reads at a glance — Created (blue) · Updated/Progress (green) · Deleted/
 * Negative (red) · Warning (yellow) · neutral.
 */
export type Severity = "created" | "updated" | "deleted" | "warning" | "neutral";

const RED = ["deleted", "cancelled", "rejected", "failed", "refunded", "rto"];
const YELLOW = ["on_hold", "exception", "low", "unfeatured", "deactivated"];
const BLUE = ["created", "requested", "confirmed", "activated", "featured"];

export function eventSeverity(event: string): Severity {
  const verb = event.split(".").pop() ?? event;
  if (RED.some((k) => verb.includes(k))) return "deleted";
  if (YELLOW.some((k) => verb.includes(k))) return "warning";
  if (BLUE.some((k) => verb.includes(k))) return "created";
  return "updated"; // set/assigned/tagged/updated/advanced/dispatched/delivered/processed/…
}
