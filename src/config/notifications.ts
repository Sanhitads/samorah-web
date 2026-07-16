/**
 * Multi-channel notification routing (operational alerting). Deterministic, configurable:
 * every operational business event maps to the exact channels it should reach, the Slack channel
 * it belongs in, and its severity. "Not every notification goes to every channel."
 *
 *   Priority levels (audience + intent):
 *     1 In-app   — always (staff dashboard log)
 *     2 Email    — summaries, reports, transactional
 *     3 Slack    — operational events (orders, inventory, payments, refunds, errors, deploys)
 *     4 SMS      — CRITICAL only (gateway down, site down, DB unavailable, security, oversell)
 *     5 WhatsApp — future (managers/warehouse/founder/care)   [structure ready, dormant]
 *     6 Push     — future                                       [structure ready, dormant]
 *
 * Edit routes here — no engine or channel changes needed to re-route an event.
 */
export type OpsChannelKey = "in_app" | "email" | "slack" | "sms" | "whatsapp" | "push";
export type OpsSeverity = "info" | "warning" | "critical";

/** An order at/above this value routes as a "high value" event (its own #orders highlight). */
export const HIGH_VALUE_ORDER_INR = 5000;

/** Slack destination channels. Each maps to its own incoming-webhook env var; missing ones fall
 *  back to the default #samorah-ops webhook, so per-area channels are pure plug-and-play. */
export type SlackChannelKey = "ops" | "orders" | "warehouse" | "payments" | "customers" | "marketing" | "tech";
export const SLACK_WEBHOOK_ENV: Record<SlackChannelKey, string> = {
  ops: "SLACK_WEBHOOK_URL",
  orders: "SLACK_WEBHOOK_ORDERS",
  warehouse: "SLACK_WEBHOOK_WAREHOUSE",
  payments: "SLACK_WEBHOOK_PAYMENTS",
  customers: "SLACK_WEBHOOK_CUSTOMERS",
  marketing: "SLACK_WEBHOOK_MARKETING",
  tech: "SLACK_WEBHOOK_TECH",
};

/** Slack attachment colour by severity (left bar). */
export const SEVERITY_COLOR: Record<OpsSeverity, string> = { info: "#2f855a", warning: "#c8901f", critical: "#b3261e" };
export const SEVERITY_EMOJI: Record<OpsSeverity, string> = { info: "🟢", warning: "🟡", critical: "🔴" };

/** The complete operational event catalogue. Add an event here + a route below to wire it. */
export type OpsEvent =
  | "order.placed" | "order.failed" | "order.high_value" | "order.bulk"
  | "payment.failed" | "payment.gateway_down" | "refund.failed" | "chargeback"
  | "inventory.low_stock" | "inventory.sync_failed" | "shipment.delayed"
  | "review.negative" | "support.escalation" | "customer.vip"
  | "newsletter.results" | "campaign.performance" | "cart.abandoned_stats"
  | "tech.error" | "cron.failed" | "webhook.failed" | "deployment.success" | "api.down"
  | "site.down" | "security.incident" | "database.unavailable"
  | "daily.sales_report"
  | "incident.escalated";

export interface OpsRoute { channels: OpsChannelKey[]; slack: SlackChannelKey; severity: OpsSeverity }

/**
 * Event → routing. Follows the priority model: everything is in-app; Slack carries operational
 * detail; SMS is reserved for genuine emergencies (and the SMS channel itself refuses anything
 * below `critical`, so a mis-configured route can never spam SMS).
 */
export const OPS_ROUTES: Record<OpsEvent, OpsRoute> = {
  // Orders → #orders
  "order.placed":       { channels: ["in_app", "slack"], slack: "orders", severity: "info" },
  "order.failed":       { channels: ["in_app", "email", "slack"], slack: "orders", severity: "warning" },
  "order.high_value":   { channels: ["in_app", "slack"], slack: "orders", severity: "info" },
  "order.bulk":         { channels: ["in_app", "slack"], slack: "orders", severity: "info" },
  // Payments → #payments
  "payment.failed":     { channels: ["in_app", "slack"], slack: "payments", severity: "warning" },
  "payment.gateway_down": { channels: ["in_app", "email", "slack", "sms"], slack: "payments", severity: "critical" },
  "refund.failed":      { channels: ["in_app", "email", "slack"], slack: "payments", severity: "warning" },
  "chargeback":         { channels: ["in_app", "slack"], slack: "payments", severity: "warning" },
  // Warehouse → #warehouse
  "inventory.low_stock":  { channels: ["in_app", "slack"], slack: "warehouse", severity: "warning" },
  "inventory.sync_failed": { channels: ["in_app", "slack", "sms"], slack: "warehouse", severity: "critical" },
  "shipment.delayed":   { channels: ["in_app", "slack"], slack: "warehouse", severity: "warning" },
  // Customers → #customers
  "review.negative":    { channels: ["in_app", "slack"], slack: "customers", severity: "warning" },
  "support.escalation": { channels: ["in_app", "slack"], slack: "customers", severity: "warning" },
  "customer.vip":       { channels: ["in_app", "slack"], slack: "customers", severity: "info" },
  // Marketing → #marketing
  "newsletter.results": { channels: ["slack"], slack: "marketing", severity: "info" },
  "campaign.performance": { channels: ["slack"], slack: "marketing", severity: "info" },
  "cart.abandoned_stats": { channels: ["slack"], slack: "marketing", severity: "info" },
  // Tech → #tech
  "tech.error":         { channels: ["in_app", "slack"], slack: "tech", severity: "warning" },
  "cron.failed":        { channels: ["in_app", "slack"], slack: "tech", severity: "warning" },
  "webhook.failed":     { channels: ["in_app", "slack"], slack: "tech", severity: "warning" },
  "deployment.success": { channels: ["slack"], slack: "tech", severity: "info" },
  "api.down":           { channels: ["in_app", "slack", "sms"], slack: "tech", severity: "critical" },
  // Critical infra → #tech + SMS
  "site.down":          { channels: ["in_app", "email", "slack", "sms"], slack: "tech", severity: "critical" },
  "security.incident":  { channels: ["in_app", "email", "slack", "sms"], slack: "tech", severity: "critical" },
  "database.unavailable": { channels: ["in_app", "slack", "sms"], slack: "tech", severity: "critical" },
  // Reports / cross-cutting
  "daily.sales_report": { channels: ["slack", "email"], slack: "ops", severity: "info" },
  "incident.escalated": { channels: ["in_app", "slack"], slack: "tech", severity: "warning" },
};

/** Events whose severity we treat as SMS-worthy even before the per-payload severity check. Used to
 *  document/verify intent; the SMS channel independently enforces `critical`-only. */
export const SMS_CRITICAL_EVENTS: OpsEvent[] = ["payment.gateway_down", "inventory.sync_failed", "api.down", "site.down", "security.incident", "database.unavailable"];

// ═══════════════════════════════════════════════════════════════════════════════
// Operations Center — categories, delivery lifecycle, retention, test presets
// ═══════════════════════════════════════════════════════════════════════════════

/** Feed filter categories. Stored on each row so filtering stays indexed at 50k+ rows. */
export type NotificationCategory = "orders" | "payments" | "inventory" | "warehouse" | "marketing" | "customers" | "system";
export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  orders: "Orders", payments: "Payments", inventory: "Inventory", warehouse: "Warehouse",
  marketing: "Marketing", customers: "Customers", system: "System",
};
export const EVENT_CATEGORY: Record<OpsEvent, NotificationCategory> = {
  "order.placed": "orders", "order.failed": "orders", "order.high_value": "orders", "order.bulk": "orders",
  "payment.failed": "payments", "payment.gateway_down": "payments", "refund.failed": "payments", "chargeback": "payments",
  "inventory.low_stock": "inventory", "inventory.sync_failed": "inventory", "shipment.delayed": "warehouse",
  "review.negative": "customers", "support.escalation": "customers", "customer.vip": "customers",
  "newsletter.results": "marketing", "campaign.performance": "marketing", "cart.abandoned_stats": "marketing",
  "tech.error": "system", "cron.failed": "system", "webhook.failed": "system", "deployment.success": "system", "api.down": "system",
  "site.down": "system", "security.incident": "system", "database.unavailable": "system",
  "daily.sales_report": "system", "incident.escalated": "system",
};

/** Delivery lifecycle. `delivered` = the provider accepted it (Slack 200 / MSG91 queued / Resend
 *  accepted). `dead` = the retry policy was exhausted → the Dead Letter Queue (never discarded;
 *  it keeps its reason + retry history and can be replayed manually). */
export type DeliveryStatus = "queued" | "sending" | "delivered" | "failed" | "retrying" | "skipped" | "dead";

/**
 * RETENTION — the log must not grow forever. Class is derived per notification; a nightly purge
 * deletes rows past `expires_at`. Critical/incident history is kept for audit; test noise is short.
 */
export type RetentionClass = "high" | "operational" | "debug";
export const RETENTION_DAYS: Record<RetentionClass, number> = { high: 730, operational: 180, debug: 30 };
/** Deterministic retention class: critical severity or audit-worthy events → high; tests → debug. */
export function retentionClassFor(event: OpsEvent, severity: OpsSeverity, entityType?: string | null): RetentionClass {
  if (entityType === "test") return "debug";
  if (severity === "critical") return "high";
  if (event === "incident.escalated" || event === "security.incident") return "high";
  return "operational";
}

/**
 * RETRY POLICY + DEAD LETTER QUEUE. A failed dispatch is retried with backoff by the retry worker;
 * once `maxAttempts` is exhausted it moves to the DLQ (status `dead`) rather than silently sitting
 * as "failed" forever. Nothing is deleted — the DLQ keeps the reason + full retry history and
 * supports manual replay. Manual retry from the drawer is unaffected by this policy.
 */
export const RETRY_POLICY = {
  maxAttempts: 4,                    // 1 initial + 3 automatic retries, then DLQ
  backoffMinutes: [1, 5, 15],        // delay before attempt 2, 3, 4
  /** Channels worth auto-retrying. `skipped` (unconfigured) is never retried — it isn't a failure. */
  autoRetryChannels: ["slack", "email", "sms", "whatsapp", "push"] as OpsChannelKey[],
};
/** Backoff delay (minutes) before the given attempt number, clamped to the last configured step. */
export function backoffFor(attempt: number): number {
  const b = RETRY_POLICY.backoffMinutes;
  return b[Math.min(Math.max(attempt - 1, 0), b.length - 1)];
}

/**
 * CORRELATION — repeated failures caused by one root incident (a Razorpay outage producing 50
 * payment failures) share a correlation_id, so the feed collapses them into ONE item with a count
 * while every underlying event stays drillable. Deterministic: the key is derived, never guessed.
 */
export const CORRELATION = {
  enabled: true,
  windowMinutes: 15,   // a new event joins an existing correlation formed within this window
  minCount: 3,         // the feed only collapses once this many events share a correlation
  /** Only noisy/failure-ish events correlate; one-off reports never collapse. */
  events: ["payment.failed", "payment.gateway_down", "refund.failed", "order.failed",
    "inventory.low_stock", "inventory.sync_failed", "shipment.delayed",
    "tech.error", "cron.failed", "webhook.failed", "api.down"] as OpsEvent[],
};
/** The deterministic correlation key: the event, plus its root incident when one is known. */
export function correlationKeyFor(event: OpsEvent, entityType?: string | null, entityRef?: string | null): string | null {
  if (!CORRELATION.enabled || !CORRELATION.events.includes(event)) return null;
  return entityType === "incident" && entityRef ? `${event}:incident:${entityRef}` : event;
}

/**
 * DEDUPLICATION / NOISE SUPPRESSION. "Gateway down ×27 in 30 seconds" should be ONE Slack post with
 * a counter, not 27. The first occurrence in a window dispatches (the *leader*); repeats inside the
 * window bump its counter and are recorded in `notification_occurrences` — so channels stay quiet
 * while the audit trail keeps every single occurrence.
 *
 * Distinct from CORRELATION: correlation groups *different* events sharing a root cause for display;
 * dedup suppresses *identical* events at dispatch time.
 */
export const DEDUP = {
  enabled: true,
  windowMinutes: 5,          // default: repeats within this window collapse onto the leader
  /**
   * Per-event window overrides. A STANDING condition (stock is low until someone restocks) must not
   * re-alert every cron tick — a 5-minute window would mean ~48 identical Slack posts a day. A
   * TRANSIENT failure keeps the short window so a genuine new burst still surfaces quickly.
   */
  windowOverrides: { "inventory.low_stock": 720, "inventory.sync_failed": 60, "shipment.delayed": 240 } as Partial<Record<OpsEvent, number>>,
  /** Never dedup these — a report or a deploy notice is meant to arrive every time. */
  exclude: ["daily.sales_report", "deployment.success"] as OpsEvent[],
};
/** The deterministic dedup signature: event + entity + severity. */
export function dedupKeyFor(event: OpsEvent, severity: OpsSeverity, entityRef?: string | null): string | null {
  if (!DEDUP.enabled || DEDUP.exclude.includes(event)) return null;
  return `${event}|${entityRef ?? "-"}|${severity}`;
}
/** How long repeats of this event collapse for (minutes). */
export function dedupWindowFor(event: OpsEvent): number {
  return DEDUP.windowOverrides[event] ?? DEDUP.windowMinutes;
}

/**
 * CHANNEL RATE LIMITING. Dedup catches *identical* floods; this caps a channel regardless of variety
 * (100 different failing orders would still be 100 Slack posts). Over the limit, a dispatch is
 * QUEUED (status `queued` + `next_retry_at`) and drained by the existing retry worker — delayed,
 * **never dropped**. Critical severity bypasses entirely: an emergency must never be throttled.
 */
export const RATE_LIMITS: Partial<Record<OpsChannelKey, { maxPerWindow: number; windowMinutes: number }>> = {
  slack: { maxPerWindow: 20, windowMinutes: 1 },
  email: { maxPerWindow: 10, windowMinutes: 1 },
  sms: { maxPerWindow: 3, windowMinutes: 5 },
  whatsapp: { maxPerWindow: 10, windowMinutes: 1 },
  push: { maxPerWindow: 30, windowMinutes: 1 },
  // in_app is intentionally unlimited — it's a DB row, not an outbound provider call.
};
/** Severities that bypass rate limiting outright (never drop or delay an emergency). */
export const RATE_LIMIT_BYPASS: OpsSeverity[] = ["critical"];

/**
 * SCHEDULED (AUTOMATIC) REPLAY. When a channel recovers, its dead letters should not need a human.
 * "Recovered" is a deterministic signal: recent successful deliveries and no recent failures.
 *
 * Loop safety: only dead letters that have NEVER been replayed are auto-replayed (`replayed_at IS
 * NULL`). So each gets exactly ONE automatic attempt, ever — if it fails again it stays in the DLQ
 * for a human. Without this an auto-replay would re-attempt the same dead letter every run forever.
 * Bounded per run so a recovery can't re-flood the channel.
 */
export const AUTO_REPLAY = {
  enabled: true,
  maxPerRun: 10,            // never mass-replay a backlog into a just-recovered channel
  healthLookbackMinutes: 15, // window used to judge "the channel is back"
  minSuccesses: 2,           // …this many recent deliveries, and
  maxRecentFailures: 0,      // …no recent failures
  maxAgeHours: 72,           // don't resurrect ancient alerts nobody cares about any more
};

/** Channel presentation — icon + label (tiny UX win; the label stays for a11y/tooltips). */
export const CHANNEL_ICON: Record<OpsChannelKey, string> = {
  in_app: "🔔", email: "✉️", slack: "💬", sms: "📱", whatsapp: "🟢", push: "📲",
};

/** Test presets — fire a realistic payload per event so formatting is exercised for real. */
export interface TestPreset { id: string; label: string; event: OpsEvent; severity: OpsSeverity }
export const TEST_PRESETS: TestPreset[] = [
  { id: "new_order", label: "Test New Order", event: "order.placed", severity: "info" },
  { id: "payment_failure", label: "Test Payment Failure", event: "payment.failed", severity: "warning" },
  { id: "critical_incident", label: "Test Critical Incident", event: "payment.gateway_down", severity: "critical" },
  { id: "inventory_alert", label: "Test Inventory Alert", event: "inventory.low_stock", severity: "warning" },
];
