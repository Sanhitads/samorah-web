import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { claimFulfillmentJobs, completeFulfillmentJob } from "@/services/orderService";
import { emailConfigured } from "@/lib/email";
import { notify } from "@/lib/notifications/engine";
import type { NotificationEvent } from "@/lib/notifications/types";
import { createShipmentForOrder } from "@/services/shipmentService";
import { getShippingSettings } from "@/lib/settings/shippingSettings";

/**
 * POST /api/cron/fulfillment — drains the fulfillment_jobs queue.
 *  - `shipping` creates the shipment via the active provider (Manual today).
 *  - notification jobs (`email`/`dispatch_email`/`cancellation_email`) each map to
 *    a business EVENT and go through the Notification Engine, which fans out to
 *    every subscribed channel. External failures never touch the order — a job
 *    retries (≤3) then goes to `failed`.
 */
export const runtime = "nodejs";
const MAX_ATTEMPTS = 3;

// job_type → notification event. The engine owns channels + templates.
const NOTIFY_JOBS: { type: "email" | "dispatch_email" | "cancellation_email"; event: NotificationEvent }[] = [
  { type: "email", event: "order.confirmed" },
  { type: "dispatch_email", event: "order.dispatched" },
  { type: "cancellation_email", event: "order.cancelled" },
];

const devDetail = (e: unknown) =>
  process.env.NODE_ENV !== "production" ? { detail: e instanceof Error ? e.message : String(e) } : {};

async function safeComplete(id: string, status: "done" | "failed" | "queued", error?: string) {
  try {
    await completeFulfillmentJob(id, status, error);
  } catch (e) {
    console.error("completeFulfillmentJob failed", e);
  }
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = { emailConfigured: emailConfigured(), autoAssign: false, notificationsSent: 0, notificationsFailed: 0, shipmentsCreated: 0, shipmentsSkipped: 0, shipmentsFailed: 0 };

  try {
    // ── Shipping jobs ──
    const settings = await getShippingSettings();
    result.autoAssign = settings.autoAssign;
    const shipJobs = await claimFulfillmentJobs("shipping", 20);
    for (const j of shipJobs) {
      if (!settings.autoAssign) {
        await safeComplete(j.id, "done", "manual mode: shipment created via dashboard");
        result.shipmentsSkipped++;
        continue;
      }
      try {
        const res = await createShipmentForOrder(j.orderId);
        if (res.ok) {
          await safeComplete(j.id, "done");
          result.shipmentsCreated++;
        } else {
          await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", res.reason);
          result.shipmentsFailed++;
        }
      } catch (e) {
        await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", e instanceof Error ? e.message : "error");
        result.shipmentsFailed++;
      }
    }

    // ── Notification jobs → Notification Engine ──
    // Only claim while email (the only live channel) is configured, so attempts
    // don't climb on unconfigured infra — jobs wait untouched in the queue.
    if (result.emailConfigured) {
      for (const { type, event } of NOTIFY_JOBS) {
        const jobs = await claimFulfillmentJobs(type, 20);
        for (const j of jobs) {
          try {
            const { anyFailed } = await notify(event, { orderId: j.orderId });
            if (!anyFailed) {
              await safeComplete(j.id, "done");
              result.notificationsSent++;
            } else {
              await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", "a channel failed");
              result.notificationsFailed++;
            }
          } catch (e) {
            await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", e instanceof Error ? e.message : "error");
            result.notificationsFailed++;
          }
        }
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("fulfillment cron failed", e);
    return NextResponse.json({ error: "Fulfillment run failed.", ...devDetail(e) }, { status: 500 });
  }
}

// Vercel Cron invokes the path with GET; accept it (still guarded by CRON_SECRET).
export const GET = POST;
