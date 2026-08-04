/**
 * Email channel — the only live channel today. Owns the mapping from event →
 * email template and delivery via the existing email provider. Adding WhatsApp is
 * a sibling file implementing the same NotificationChannel interface.
 */
import { emailConfigured, sendEmail, buildOrderConfirmationEmail, buildDispatchNotificationEmail, buildCancellationEmail, buildReturnEmail, buildDeliveryEmail, type EmailOrder, type ReturnEmailEvent } from "@/lib/email";
import { getOrderById } from "@/services/orderService";
import { getDispatchInfo, getDeliveryInfo } from "@/services/shipmentService";
import { getCancellationInfo } from "@/services/cancellationService";
import { getReturnInfo } from "@/services/returnService";
import { resolveSubject, renderAuthoredEmail } from "@/services/emailTemplateService";
import type { NotificationChannel, NotificationEvent, NotificationContext, ChannelDispatchResult } from "../types";

/**
 * Compose the final email: if the admin has AUTHORED a block body for this event, use
 * it (subject + block HTML); otherwise keep the hardcoded builder and just apply a
 * subject override. `details` carries the builder's HTML for a "details" block to
 * inject, so an authored email can still include the order table.
 */
async function compose(event: string, msg: { to: string; subject: string; html: string; text: string }, vars: Record<string, string>): Promise<typeof msg> {
  const authored = await renderAuthoredEmail(event, { ...vars, details: msg.html });
  if (authored) return { to: msg.to, ...authored };
  return { ...msg, subject: await resolveSubject(event, msg.subject, vars) };
}

/**
 * Assemble the {to, subject, html, text} for an event, or null if we can't.
 * NB: the per-event `vars` maps below are the canonical send-time variables. They MUST stay in sync
 * with EMAIL_TEMPLATE_DEFS[event].vars (emailTemplateService) — the admin variables panel advertises
 * those, and a divergence would let an admin author a {{token}} production never resolves. The guard
 * test in emailTemplateValidation.test.ts pins the two together.
 */
async function render(event: NotificationEvent, ctx: NotificationContext): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  switch (event) {
    case "order.confirmed": {
      const order = await getOrderById(ctx.orderId) as any;
      if (!order) return null;
      const built = buildOrderConfirmationEmail(order as unknown as EmailOrder);
      return compose(event, { to: order.email, ...built }, { orderNumber: order.order_number ?? order.orderNumber ?? "", name: order.ship_full_name ?? "", total: String(order.total_amount ?? "") });
    }
    case "order.dispatched": {
      const info = await getDispatchInfo(ctx.orderId) as any;
      if (!info) return null;
      return compose(event, { to: info.email, ...buildDispatchNotificationEmail(info) }, { orderNumber: info.order_number ?? "", name: info.ship_full_name ?? "", courier: info.courier_name ?? "", awb: info.awb ?? "" });
    }
    case "order.cancelled": {
      const info = await getCancellationInfo(ctx.orderId) as any;
      if (!info) return null;
      return compose(event, { to: info.email, ...buildCancellationEmail(info) }, { orderNumber: info.order_number ?? "", name: info.ship_full_name ?? "" });
    }
    case "delivery.completed": {
      const info = await getDeliveryInfo(ctx.orderId) as any;
      if (!info || !info.email) return null;
      return compose(event, { to: info.email, ...buildDeliveryEmail(info) }, { orderNumber: info.order_number ?? "", name: info.ship_full_name ?? "" });
    }
    case "return.requested":
    case "return.approved":
    case "return.rejected":
    case "return.refunded": {
      if (!ctx.returnId) return null;
      const info = await getReturnInfo(ctx.returnId) as any;
      if (!info || !info.email) return null;
      return compose(event, { to: info.email, ...buildReturnEmail(event as ReturnEmailEvent, info) }, { rmaNumber: info.rma ?? "", orderNumber: info.order_number ?? "" });
    }
    default:
      return null;
  }
}

export const emailChannel: NotificationChannel = {
  key: "email",
  configured: () => emailConfigured(),
  async send(event: NotificationEvent, ctx: NotificationContext): Promise<ChannelDispatchResult> {
    const msg = await render(event, ctx);
    if (!msg) return { channel: "email", status: "failed", error: "no data / no template for event" };
    const r = await sendEmail({ to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return r.sent
      ? { channel: "email", status: "sent", recipient: msg.to }
      : { channel: "email", status: "failed", recipient: msg.to, error: r.reason };
  },
};
