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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Enterprise Readiness config (deterministic + explainable + configurable)
// ═══════════════════════════════════════════════════════════════════════════════

/** CONFIDENCE — how sure the engine is that an incident is real. Weighted, additive, capped at 100.
 *  Every point is attributable (shown in the UI), so operators can trust — or challenge — it. */
export const CONFIDENCE_WEIGHTS = {
  base: 40,                 // a rule fired at all
  perEventOverThreshold: 6, // each event beyond the threshold (more events = surer), capped below
  eventsCap: 30,            // max contribution from event volume
  reasonMatched: 15,        // the failure reason matched the rule's root-cause pattern
  knownRootCause: 10,       // classified to a concrete system (not "unknown")
  tightWindow: 5,           // all events within half the rule window (a real burst, not a trickle)
};

/** PRIORITY MATRIX — Priority ≠ Severity. Priority = f(Severity, Business impact). */
export type IncidentPriority = "p1" | "p2" | "p3" | "p4";
export const PRIORITY_LABEL: Record<IncidentPriority, string> = { p1: "P1 — Critical", p2: "P2 — High", p3: "P3 — Medium", p4: "P4 — Low" };
export type ImpactLevel = "none" | "low" | "medium" | "high";
export const IMPACT_LABEL: Record<ImpactLevel, string> = { none: "None", low: "Low", medium: "Medium", high: "High" };
/** Impact buckets from affected-order count (configurable). */
export const IMPACT_THRESHOLDS = { high: 20, medium: 5, low: 1 };
/** severity → (impact → priority). */
export const PRIORITY_MATRIX: Record<IncidentSeverity, Record<ImpactLevel, IncidentPriority>> = {
  critical: { high: "p1", medium: "p1", low: "p2", none: "p2" },
  high:     { high: "p1", medium: "p2", low: "p2", none: "p3" },
  medium:   { high: "p2", medium: "p3", low: "p3", none: "p3" },
  low:      { high: "p3", medium: "p3", low: "p4", none: "p4" },
  info:     { high: "p3", medium: "p4", low: "p4", none: "p4" },
};

/** SLA resolution targets (minutes) by priority. Breach → tracked + escalated. */
export const SLA_TARGETS_MIN: Record<IncidentPriority, number> = { p1: 30, p2: 60, p3: 240, p4: 1440 };

/**
 * DYNAMIC THRESHOLDS — the rule threshold isn't constant. Multiply the rule's base threshold by
 * the multiplier for the current time context (business hours = strict; night/weekend = lenient).
 * Base 5 → business 5 · off-hours 20 (×4) · weekend 10 (×2). Business calendar can override.
 */
export const DYNAMIC_THRESHOLDS = {
  enabled: true,
  timezoneOffsetMin: 330,   // IST (UTC+5:30) — evaluate "business hours" in local time
  businessHours: { startHour: 9, endHour: 21, days: [1, 2, 3, 4, 5] }, // Mon–Fri 09:00–21:00
  multipliers: { businessHours: 1, offHours: 4, weekend: 2 },
};

/**
 * BUSINESS CALENDAR — named periods that tighten thresholds (a sale means even 2 failures matter).
 * `thresholdMultiplier` < 1 lowers the trigger count; `severityBoost` bumps opened severity.
 * Dates are explicit ISO windows the operator maintains.
 */
export interface CalendarPeriod { name: string; startsAt: string; endsAt: string; thresholdMultiplier: number; severityBoost: number }
export const BUSINESS_CALENDAR: CalendarPeriod[] = [
  { name: "Diwali Sale 2026", startsAt: "2026-10-25T00:00:00+05:30", endsAt: "2026-11-05T23:59:59+05:30", thresholdMultiplier: 0.4, severityBoost: 1 },
  { name: "Republic Day Sale 2027", startsAt: "2027-01-24T00:00:00+05:30", endsAt: "2027-01-27T23:59:59+05:30", thresholdMultiplier: 0.5, severityBoost: 1 },
];

/** Absolute floor for an effective threshold after all multipliers (never trigger on a single blip). */
export const MIN_EFFECTIVE_THRESHOLD = 2;

/**
 * ADVANCED AUTO-ASSIGNMENT — ordered rules; the first whose conditions all match wins. Extends the
 * Phase 2 category→team default with value/severity/root-cause conditions. `assignRole` picks the
 * first staff member holding that role (deterministic, ordered by name). Every match is logged.
 */
export interface AutoAssignRule { label: string; when: { category?: IncidentCategory; rootCauseSystem?: RootCauseSystem; minRevenue?: number; minSeverity?: IncidentSeverity }; team: IncidentTeam; assignRole?: "manager" | "admin" }
export const AUTO_ASSIGNMENT_RULES: AutoAssignRule[] = [
  { label: "High-value refund (≥ ₹10,000) → Finance Manager", when: { category: "refund", minRevenue: 10000 }, team: "finance", assignRole: "manager" },
  { label: "Critical payments → Finance Manager", when: { category: "payment_gateway", minSeverity: "critical" }, team: "finance", assignRole: "manager" },
  { label: "Shiprocket issues → Warehouse", when: { rootCauseSystem: "shiprocket" }, team: "warehouse" },
  { label: "Email delivery → Marketing", when: { category: "email" }, team: "marketing" },
];

/**
 * RUNBOOK ENGINE — a guided, ordered operational workflow per incident type (distinct from a
 * checklist: each step carries an instruction and an explicit action verb). Seeded on incident
 * creation; operators tick steps as they execute them.
 */
export type RunbookAction = "retry" | "verify" | "check" | "contact" | "wait" | "escalate" | "custom";
export interface RunbookStep { title: string; instruction: string; action: RunbookAction }
export const INCIDENT_RUNBOOKS: Partial<Record<IncidentCategory, RunbookStep[]>> = {
  refund: [
    { title: "Retry the refund", instruction: "Re-trigger the failed refund from the Razorpay dashboard or via the refund API.", action: "retry" },
    { title: "Wait for the gateway", instruction: "Allow ~30 seconds for Razorpay to process before re-checking.", action: "wait" },
    { title: "Verify refund status", instruction: "Confirm the refund shows as processed for each affected order.", action: "verify" },
    { title: "Check settlement", instruction: "Confirm the amount appears in the next settlement cycle.", action: "check" },
    { title: "Contact the customer", instruction: "Inform affected customers of the refund and expected timeline.", action: "contact" },
  ],
  payment_gateway: [
    { title: "Check Razorpay status", instruction: "Open status.razorpay.com and confirm whether it is a provider-side outage.", action: "check" },
    { title: "Verify webhook health", instruction: "Confirm webhooks are being received and processed (webhook_logs).", action: "verify" },
    { title: "Notify affected customers", instruction: "Message customers with failed payments about retrying.", action: "contact" },
    { title: "Confirm recovery", instruction: "Verify new payments succeed before resolving.", action: "verify" },
    { title: "Escalate if unresolved", instruction: "If the outage persists beyond SLA, escalate to the manager.", action: "escalate" },
  ],
  shipment: [
    { title: "Contact the courier", instruction: "Reach the Shiprocket/courier support for the exception batch.", action: "contact" },
    { title: "Check AWB / tracking", instruction: "Verify AWB assignment and tracking status for affected shipments.", action: "check" },
    { title: "Update the customer", instruction: "Send a delay/exception update to affected customers.", action: "contact" },
    { title: "Re-attempt or RTO", instruction: "Trigger a re-attempt, or initiate RTO where delivery has failed.", action: "custom" },
  ],
  email: [
    { title: "Check Resend status", instruction: "Confirm Resend/SMTP availability and API key validity.", action: "check" },
    { title: "Verify sending domain", instruction: "Check SPF/DKIM/DNS for the sending domain.", action: "verify" },
    { title: "Re-queue failed emails", instruction: "Re-dispatch the failed notification emails.", action: "retry" },
  ],
  inventory: [
    { title: "Re-run inventory sync", instruction: "Trigger a fresh inventory sync job.", action: "retry" },
    { title: "Verify stock counts", instruction: "Confirm on-hand vs reserved counts reconcile.", action: "verify" },
    { title: "Check integration logs", instruction: "Inspect sync/integration logs for the failure cause.", action: "check" },
  ],
};

/** INCIDENT TEMPLATES — the predefined bundle applied on creation (owner team, priority floor,
 *  and which artefacts to seed). Ties together the category configs above. */
export interface IncidentTemplate { team: IncidentTeam; seedChecklist: boolean; seedRunbook: boolean; priorityFloor?: IncidentPriority }
export const INCIDENT_TEMPLATES: Record<IncidentCategory, IncidentTemplate> = {
  refund: { team: "finance", seedChecklist: true, seedRunbook: true },
  payment_gateway: { team: "finance", seedChecklist: true, seedRunbook: true, priorityFloor: "p2" },
  shipment: { team: "warehouse", seedChecklist: true, seedRunbook: true },
  inventory: { team: "warehouse", seedChecklist: true, seedRunbook: true },
  email: { team: "marketing", seedChecklist: true, seedRunbook: true },
  import_export: { team: "admin", seedChecklist: true, seedRunbook: false },
  unknown: { team: "admin", seedChecklist: false, seedRunbook: false },
};

/**
 * DEPENDENCY GRAPH — how upstream systems cascade into downstream ones. Used to render the visual
 * graph and to highlight which downstream areas an active incident's root cause can affect.
 */
export type DepNode = RootCauseSystem | Subsystem | "refund" | "webhook";
export interface DepEdge { from: DepNode; to: DepNode }
export const DEPENDENCY_NODES: { id: DepNode; label: string; layer: number }[] = [
  { id: "database", label: "Database", layer: 0 },
  { id: "supabase", label: "Supabase", layer: 0 },
  { id: "razorpay", label: "Razorpay", layer: 1 },
  { id: "shiprocket", label: "Shiprocket", layer: 1 },
  { id: "smtp", label: "SMTP", layer: 1 },
  { id: "payments", label: "Payments", layer: 2 },
  { id: "refund", label: "Refund", layer: 2 },
  { id: "webhook", label: "Webhook", layer: 3 },
  { id: "shipping", label: "Shipping", layer: 3 },
  { id: "inventory", label: "Inventory", layer: 3 },
  { id: "email", label: "Email", layer: 4 },
];
export const DEPENDENCY_EDGES: DepEdge[] = [
  { from: "database", to: "supabase" },
  { from: "supabase", to: "payments" },
  { from: "razorpay", to: "payments" },
  { from: "razorpay", to: "refund" },
  { from: "payments", to: "webhook" },
  { from: "refund", to: "email" },
  { from: "webhook", to: "email" },
  { from: "shiprocket", to: "shipping" },
  { from: "shipping", to: "email" },
  { from: "supabase", to: "inventory" },
];

/**
 * COST MODEL — estimated financial cost of an incident (management-facing). Deterministic formula:
 *   refundValue·refundWeight + delayed·perDelayedShipment + (SLA breached? penalty) +
 *   opsCostPerHour·hoursOpen + revenue·revenueAtRiskPct.
 */
export const COST_MODEL = {
  revenueAtRiskPct: 0.2,        // fraction of affected order value treated as at-risk
  refundWeight: 1.0,            // refunds counted at face value
  perDelayedShipment: 200,      // ₹ soft cost per delayed shipment
  slaBreachPenalty: 5000,       // ₹ flat penalty when the SLA is breached
  opsCostPerHour: 800,          // ₹ operational labour per hour the incident stays open
};
