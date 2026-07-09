import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { claimFulfillmentJobs, completeFulfillmentJob, getOrderById } from "@/services/orderService";
import { emailConfigured, sendEmail, buildOrderConfirmationEmail, buildDispatchNotificationEmail, type EmailOrder } from "@/lib/email";
import { createShipmentForOrder, getDispatchInfo } from "@/services/shipmentService";
import { getShippingSettings } from "@/lib/settings/shippingSettings";

/**
 * POST /api/cron/fulfillment — drains the fulfillment_jobs queue. Processes:
 *  - `email`    confirmation emails (gated on Resend being configured)
 *  - `shipping` creates the shipment via the active provider (Manual today — always
 *               available). External failures never touch the order — a job retries
 *               (≤3) then goes to `failed`.
 */
export const runtime = "nodejs";
const MAX_ATTEMPTS = 3;

const devDetail = (e: unknown) =>
  process.env.NODE_ENV !== "production" ? { detail: e instanceof Error ? e.message : String(e) } : {};

/** Marking a job's outcome must never crash the worker. */
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

  const result = { emailConfigured: emailConfigured(), autoAssign: false, emailsSent: 0, emailsFailed: 0, shipmentsCreated: 0, shipmentsSkipped: 0, shipmentsFailed: 0, dispatchEmailsSent: 0 };

  try {
    // ── Shipping jobs ──
    // Manual mode (auto_assign = false): the shipment is created by staff via the
    // Fulfillment Dashboard at "Ready for Dispatch", so the worker SKIPS these jobs.
    // Auto mode (auto_assign = true): create the shipment on payment (hands-off).
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

    // Only claim email jobs when Resend is configured, so attempts don't climb
    // while unconfigured — jobs wait untouched in the queue.
    if (result.emailConfigured) {
      const jobs = await claimFulfillmentJobs("email", 20);
      for (const j of jobs) {
        try {
          const order = await getOrderById(j.orderId);
          if (!order) {
            await safeComplete(j.id, "failed", "order not found");
            result.emailsFailed++;
            continue;
          }
          const { subject, html, text } = buildOrderConfirmationEmail(order as unknown as EmailOrder);
          const r = await sendEmail({ to: order.email, subject, html, text });
          if (r.sent) {
            await safeComplete(j.id, "done");
            result.emailsSent++;
          } else {
            await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", r.reason);
            result.emailsFailed++;
          }
        } catch (e) {
          await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", e instanceof Error ? e.message : "error");
          result.emailsFailed++;
        }
      }

      // ── Dispatch emails (ORDER_DISPATCHED) ──
      const dispatchJobs = await claimFulfillmentJobs("dispatch_email", 20);
      for (const j of dispatchJobs) {
        try {
          const info = await getDispatchInfo(j.orderId);
          if (!info) {
            await safeComplete(j.id, "failed", "dispatch info not found");
            result.emailsFailed++;
            continue;
          }
          const { subject, html, text } = buildDispatchNotificationEmail(info);
          const r = await sendEmail({ to: info.email, subject, html, text });
          if (r.sent) {
            await safeComplete(j.id, "done");
            result.dispatchEmailsSent++;
          } else {
            await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", r.reason);
            result.emailsFailed++;
          }
        } catch (e) {
          await safeComplete(j.id, j.attempts < MAX_ATTEMPTS ? "queued" : "failed", e instanceof Error ? e.message : "error");
          result.emailsFailed++;
        }
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("fulfillment cron failed", e);
    return NextResponse.json({ error: "Fulfillment run failed.", ...devDetail(e) }, { status: 500 });
  }
}
