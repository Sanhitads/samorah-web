/**
 * Source-specific empty / error copy for analytics widgets. Never render a generic "No Data" — always a
 * meaningful, source-aware message so operators know whether a source is unconfigured, temporarily down,
 * gated, or simply had no rows in the window. Pure string resolver; safe to use on server or client.
 */
export type EmptyReason =
  | "not_configured" // integration creds absent (GA4 property, Clarity token)
  | "unavailable" // source reachable-but-down / returned no payload
  | "no_data" // query ran fine, zero rows in the selected period
  | "permission" // caller lacks the capability
  | "api_error" // upstream API error / timeout
  | "disabled"; // widget turned off via feature flag

const LABEL: Record<string, string> = {
  ga4: "GA4",
  clarity: "Clarity",
  razorpay: "Razorpay",
  orders: "orders",
  search: "searches",
  inventory: "inventory",
  customers: "customers",
  coupons: "coupons",
};

/** Resolve the message for a source + reason. `period` (e.g. "last 30 days") sharpens no_data copy. */
export function emptyStateMessage(source: string, reason: EmptyReason, period?: string): string {
  const label = LABEL[source] ?? source;
  switch (reason) {
    case "not_configured":
      return `${LABEL[source] ?? source} not configured`;
    case "unavailable":
      return `${LABEL[source] ?? source} unavailable`;
    case "api_error":
      return `${LABEL[source] ?? source} temporarily unavailable`;
    case "permission":
      return "Permission required";
    case "disabled":
      return `${LABEL[source] ?? source} is turned off`;
    case "no_data":
    default:
      return period ? `No ${label} in ${period}` : `No ${label} in the selected period`;
  }
}
