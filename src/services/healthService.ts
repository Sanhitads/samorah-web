/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * System health (refinement R8) — at-a-glance status of the services Samorah
 * depends on, so debugging starts from one screen. Each check is cheap + isolated
 * (a failing check never throws). Statuses: ok · warn · off (not configured) · down.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { RAZORPAY } from "@/config/commerce";
import { emailConfigured } from "@/lib/email";

export type HealthStatus = "ok" | "warn" | "off" | "down";
export interface HealthCheck { name: string; status: HealthStatus; detail: string }

export async function getSystemHealth(): Promise<HealthCheck[]> {
  const db = createAdminClient() as any;
  const now = Date.now();
  const dayAgo = new Date(now - 86400000).toISOString();

  // Database
  let database: HealthCheck = { name: "Database (Supabase)", status: "down", detail: "unreachable" };
  try {
    const { error } = await db.from("orders").select("id", { count: "exact", head: true });
    database = error ? { name: "Database (Supabase)", status: "down", detail: error.message } : { name: "Database (Supabase)", status: "ok", detail: "reachable" };
  } catch (e) { database = { name: "Database (Supabase)", status: "down", detail: e instanceof Error ? e.message : "error" }; }

  // Payments
  const payments: HealthCheck = RAZORPAY.configured
    ? { name: "Payments (Razorpay)", status: "ok", detail: "keys configured" }
    : { name: "Payments (Razorpay)", status: "off", detail: "RAZORPAY_* not set" };

  // Email
  const email: HealthCheck = emailConfigured()
    ? { name: "Email (Resend)", status: "ok", detail: "configured" }
    : { name: "Email (Resend)", status: "off", detail: "RESEND_API_KEY not set" };

  // Cron
  const cron: HealthCheck = process.env.CRON_SECRET
    ? { name: "Cron", status: "ok", detail: "secret set" }
    : { name: "Cron", status: "off", detail: "CRON_SECRET not set" };

  // Webhooks — secret + recent inbound activity heartbeat
  let webhooks: HealthCheck = { name: "Webhooks", status: process.env.SHIPPING_WEBHOOK_SECRET ? "ok" : "off", detail: process.env.SHIPPING_WEBHOOK_SECRET ? "secret set" : "SHIPPING_WEBHOOK_SECRET not set" };
  try {
    const { count } = await db.from("webhook_logs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
    if (webhooks.status === "ok") webhooks.detail = `${count ?? 0} received (24h)`;
  } catch { /* table optional */ }

  // Email deliverability — recent failed dispatches
  let deliverability: HealthCheck = { name: "Email deliverability", status: "ok", detail: "no recent failures" };
  try {
    const { count } = await db.from("notification_dispatches").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", dayAgo);
    if ((count ?? 0) > 0) deliverability = { name: "Email deliverability", status: "warn", detail: `${count} failed sends (24h)` };
  } catch { /* optional */ }

  // Fulfillment queue — stuck (failed) jobs heartbeat
  let queue: HealthCheck = { name: "Fulfillment queue", status: "ok", detail: "healthy" };
  try {
    const { count } = await db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).eq("status", "failed");
    if ((count ?? 0) > 0) queue = { name: "Fulfillment queue", status: "warn", detail: `${count} failed jobs` };
  } catch { /* optional */ }

  // Storage — not yet configured (Media Library lands with CMS slice 3)
  const storage: HealthCheck = { name: "Storage (Media)", status: "off", detail: "not configured yet" };

  return [database, payments, email, cron, webhooks, deliverability, queue, storage];
}
