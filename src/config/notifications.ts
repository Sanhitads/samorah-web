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

/** Delivery lifecycle. `delivered` = the provider accepted it (Slack 200 / MSG91 queued / Resend accepted). */
export type DeliveryStatus = "queued" | "sending" | "delivered" | "failed" | "retrying" | "skipped";

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

/** Test presets — fire a realistic payload per event so formatting is exercised for real. */
export interface TestPreset { id: string; label: string; event: OpsEvent; severity: OpsSeverity }
export const TEST_PRESETS: TestPreset[] = [
  { id: "new_order", label: "Test New Order", event: "order.placed", severity: "info" },
  { id: "payment_failure", label: "Test Payment Failure", event: "payment.failed", severity: "warning" },
  { id: "critical_incident", label: "Test Critical Incident", event: "payment.gateway_down", severity: "critical" },
  { id: "inventory_alert", label: "Test Inventory Alert", event: "inventory.low_stock", severity: "warning" },
];
