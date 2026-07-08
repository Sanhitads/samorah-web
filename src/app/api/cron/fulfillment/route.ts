import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { claimFulfillmentJobs, completeFulfillmentJob, getOrderById } from "@/services/orderService";
import { emailConfigured, sendEmail, buildOrderConfirmationEmail, type EmailOrder } from "@/lib/email";

/**
 * POST /api/cron/fulfillment — drains the fulfillment_jobs queue. Runs on a
 * schedule (or a manual trigger). Currently processes confirmation-email jobs;
 * Shiprocket jobs are left queued until Stage 2B.4b. External failures never touch
 * the order — a job just retries (up to 3 attempts) then goes to `failed`.
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

  const result = { emailConfigured: emailConfigured(), emailsSent: 0, emailsFailed: 0 };

  try {
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
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("fulfillment cron failed", e);
    return NextResponse.json({ error: "Fulfillment run failed.", ...devDetail(e) }, { status: 500 });
  }
}
