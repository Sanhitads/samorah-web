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

// ── Phase 2: collaboration config ──────────────────────────────────────────────
export type IncidentTeam = "finance" | "warehouse" | "support" | "marketing" | "admin";
export const INCIDENT_TEAMS: IncidentTeam[] = ["finance", "warehouse", "support", "marketing", "admin"];
export const TEAM_LABEL: Record<IncidentTeam, string> = {
  finance: "Finance", warehouse: "Warehouse", support: "Customer Support", marketing: "Marketing", admin: "Admin",
};

/** Which team owns each category by default (set on incident creation; reassignable). */
export const CATEGORY_TEAM: Record<IncidentCategory, IncidentTeam> = {
  payment_gateway: "finance", refund: "finance", shipment: "warehouse", inventory: "warehouse",
  email: "marketing", import_export: "admin", unknown: "admin",
};

/** Configurable checklist templates, seeded onto an incident when it opens. Edit here. */
export const INCIDENT_CHECKLISTS: Partial<Record<IncidentCategory, string[]>> = {
  refund: ["Retry refund", "Verify gateway status", "Inform customer", "Confirm settlement"],
  payment_gateway: ["Check Razorpay status page", "Verify webhook health", "Notify affected customers", "Confirm recovery"],
  shipment: ["Contact courier", "Check AWB / tracking", "Update customer", "Re-attempt or RTO"],
  inventory: ["Re-run inventory sync", "Verify stock counts", "Check integration logs"],
  email: ["Check Resend status", "Verify sending domain / DNS", "Re-queue failed emails"],
  import_export: ["Re-run the job", "Validate the file", "Confirm completion"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Enterprise Operations Intelligence config (all deterministic/explainable)
// ═══════════════════════════════════════════════════════════════════════════════

/** Common upstream causes we can attribute deterministically (no AI/guessing). */
export type RootCauseSystem = "razorpay" | "shiprocket" | "smtp" | "inventory" | "database" | "supabase" | "unknown";
export const ROOT_CAUSE_LABEL: Record<RootCauseSystem, string> = {
  razorpay: "Razorpay", shiprocket: "Shiprocket", smtp: "SMTP / Email", inventory: "Inventory",
  database: "Database", supabase: "Supabase", unknown: "Unknown",
};

/**
 * Root-cause classification rules, evaluated in order. The FIRST rule whose source-system or
 * reason pattern matches wins — so the attribution is always traceable to a concrete signal
 * (shown in the UI as "why"). `sourceSystems` matches the incident's source_system; `reason`
 * is a case-insensitive regex over the failure reason / root-cause text.
 */
export interface RootCauseRule { system: RootCauseSystem; sourceSystems?: string[]; reason?: string; categories?: IncidentCategory[] }
export const ROOT_CAUSE_RULES: RootCauseRule[] = [
  { system: "razorpay", sourceSystems: ["Razorpay"], reason: "razorpay|payment|gateway|refund|upi|card" },
  { system: "shiprocket", sourceSystems: ["Shiprocket"], reason: "shiprocket|courier|awb|manifest|pickup" },
  { system: "smtp", sourceSystems: ["Resend", "SMTP"], reason: "smtp|resend|email|mail|bounce|dns|spf|dkim" },
  { system: "inventory", categories: ["inventory"], reason: "inventory|stock|sku|oversell|sync" },
  { system: "supabase", reason: "supabase|postgrest|jwt|rls|realtime|pgbouncer" },
  { system: "database", reason: "database|deadlock|timeout|connection|constraint|sql|relation|pool" },
];

/** Operational subsystems shown on the Health Dashboard. */
export type Subsystem = "payments" | "inventory" | "shipping" | "email" | "checkout" | "customers";
export const SUBSYSTEMS: Subsystem[] = ["payments", "inventory", "shipping", "email", "checkout", "customers"];
export const SUBSYSTEM_LABEL: Record<Subsystem, string> = {
  payments: "Payments", inventory: "Inventory", shipping: "Shipping", email: "Email", checkout: "Checkout", customers: "Customers",
};
/** Which subsystem an incident category primarily belongs to. */
export const CATEGORY_SUBSYSTEM: Record<IncidentCategory, Subsystem> = {
  payment_gateway: "payments", refund: "payments", shipment: "shipping", inventory: "inventory",
  email: "email", import_export: "checkout", unknown: "checkout",
};

export type HealthState = "healthy" | "warning" | "critical";
/** Health thresholds — a subsystem is Critical with any active critical incident (or ≥N active),
 *  Warning with any active high/medium (or an incident older than warnMinutes), else Healthy. */
export const HEALTH_THRESHOLDS = { criticalCount: 3, warnMinutes: 60 };

/**
 * Escalation policy — time-based, deterministic. Each level fires ONCE when an incident stays
 * unresolved past `afterMinutes`. `notify` is the role paged; `channels` how. Fully configurable.
 */
export interface EscalationLevel { level: number; afterMinutes: number; notify: "manager" | "admin"; channels: ("in_app" | "email" | "slack" | "sms")[] }
export const ESCALATION_POLICY: EscalationLevel[] = [
  { level: 1, afterMinutes: 30, notify: "manager", channels: ["in_app"] },
  { level: 2, afterMinutes: 60, notify: "admin", channels: ["in_app", "email"] },
  { level: 3, afterMinutes: 120, notify: "admin", channels: ["in_app", "email", "slack", "sms"] },
];
/** Escalation only applies to incidents at/above this severity (info/low don't page anyone). */
export const ESCALATION_MIN_SEVERITY: IncidentSeverity = "medium";

/** Cross-system correlation window — active incidents sharing a root-cause system that started
 *  within this window are grouped under one primary (the cascade → ONE incident). */
export const CROSS_SYSTEM_WINDOW_MIN = 20;
