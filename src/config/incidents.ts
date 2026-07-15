/**
 * Incident correlation rules — CONFIGURABLE (review requirement: thresholds must not be
 * hardcoded). Each rule watches a source table for a failure signature and, when the count
 * crosses `threshold` inside `windowMinutes`, opens (or merges into) one incident of its
 * category. Deterministic — no AI/ML. Add a new incident type = add a rule here.
 *
 * `mergeWindowMinutes` controls how long an open incident of the same category+rule keeps
 * absorbing new notifications before a fresh one is opened.
 */
export type IncidentCategory =
  | "payment_gateway" | "refund" | "shipment" | "inventory" | "email" | "import_export" | "unknown";

export type IncidentSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IncidentStatus = "open" | "investigating" | "mitigated" | "resolved" | "closed";

export interface IncidentRule {
  id: string;
  category: IncidentCategory;
  title: string;
  sourceSystem: string;
  /** Source table + how a failing row is identified. */
  table: "refunds" | "payment_attempts" | "shipments" | "notification_dispatches";
  statusColumn: string;
  statusValue: string;
  /** Optional root-cause filter on the reason/error columns (case-insensitive regex). */
  reasonColumns?: string[];
  reasonPattern?: string;         // stored as a string so the config stays serialisable
  rootCauseLabel: string;
  /** How the affected notification's stable alert key is derived, and its priority. */
  alertKeyPrefix: string;         // e.g. "refund_failed:order" → `${prefix}:${orderNumber}`
  notificationSeverity: IncidentSeverity;
  threshold: number;
  windowMinutes: number;
  mergeWindowMinutes: number;
  enabled: boolean;
}

/** Version-1 rules. Thresholds/windows live here so ops can tune them without code churn. */
export const INCIDENT_RULES: IncidentRule[] = [
  {
    id: "refund_gateway_timeout",
    category: "refund",
    title: "Refund failures — gateway timeout",
    sourceSystem: "Razorpay",
    table: "refunds",
    statusColumn: "status",
    statusValue: "failed",
    reasonColumns: ["error_description", "reason"],
    reasonPattern: "timeout|gateway|network|unavailable|5\\d\\d",
    rootCauseLabel: "Gateway timeout",
    alertKeyPrefix: "refund_failed:order",
    notificationSeverity: "high",
    threshold: 5,
    windowMinutes: 5,
    mergeWindowMinutes: 30,
    enabled: true,
  },
  {
    id: "payment_gateway_failures",
    category: "payment_gateway",
    title: "Payment gateway incident",
    sourceSystem: "Razorpay",
    table: "payment_attempts",
    statusColumn: "status",
    statusValue: "failed",
    rootCauseLabel: "Payment gateway errors",
    alertKeyPrefix: "failed_payments",
    notificationSeverity: "high",
    threshold: 10,
    windowMinutes: 5,
    mergeWindowMinutes: 30,
    enabled: true,
  },
  {
    id: "shipment_provider_errors",
    category: "shipment",
    title: "Shipment provider incident",
    sourceSystem: "Shiprocket",
    table: "shipments",
    statusColumn: "status",
    statusValue: "exception",
    rootCauseLabel: "Courier/API exceptions",
    alertKeyPrefix: "shipment_exception",
    notificationSeverity: "medium",
    threshold: 5,
    windowMinutes: 30,
    mergeWindowMinutes: 60,
    enabled: true,
  },
  {
    id: "email_delivery_failures",
    category: "email",
    title: "Email delivery incident",
    sourceSystem: "Resend",
    table: "notification_dispatches",
    statusColumn: "status",
    statusValue: "failed",
    rootCauseLabel: "Email delivery failures",
    alertKeyPrefix: "email_failed",
    notificationSeverity: "medium",
    threshold: 10,
    windowMinutes: 30,
    mergeWindowMinutes: 60,
    enabled: true,
  },
  // Inventory-sync-failure incidents are defined but INERT until an inventory sync-failure
  // event source exists (low stock is a standing condition, not a windowed failure). The
  // architecture is ready — flip `enabled` + point `table` at the source when it lands.
  {
    id: "inventory_sync_failures",
    category: "inventory",
    title: "Inventory sync incident",
    sourceSystem: "Inventory",
    table: "notification_dispatches", // placeholder; no sync-failure log yet
    statusColumn: "status",
    statusValue: "__never__",
    rootCauseLabel: "Inventory sync failures",
    alertKeyPrefix: "inventory_sync",
    notificationSeverity: "medium",
    threshold: 5,
    windowMinutes: 15,
    mergeWindowMinutes: 60,
    enabled: false,
  },
];

/** Category display labels. */
export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> = {
  payment_gateway: "Payment Gateway",
  refund: "Refund",
  shipment: "Shipment",
  inventory: "Inventory",
  email: "Email",
  import_export: "Import / Export",
  unknown: "Unknown",
};
