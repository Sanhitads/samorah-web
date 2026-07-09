/**
 * Email channel — the only live channel today. Owns the mapping from event →
 * email template and delivery via the existing email provider. Adding WhatsApp is
 * a sibling file implementing the same NotificationChannel interface.
 */
import { emailConfigured, sendEmail, buildOrderConfirmationEmail, buildDispatchNotificationEmail, buildCancellationEmail, type EmailOrder } from "@/lib/email";
import { getOrderById } from "@/services/orderService";
import { getDispatchInfo } from "@/services/shipmentService";
import { getCancellationInfo } from "@/services/cancellationService";
import type { NotificationChannel, NotificationEvent, NotificationContext, ChannelDispatchResult } from "../types";

/** Assemble the {to, subject, html, text} for an event, or null if we can't. */
async function render(event: NotificationEvent, orderId: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  switch (event) {
    case "order.confirmed": {
      const order = await getOrderById(orderId);
      if (!order) return null;
      const built = buildOrderConfirmationEmail(order as unknown as EmailOrder);
      return { to: (order as { email: string }).email, ...built };
    }
    case "order.dispatched": {
      const info = await getDispatchInfo(orderId);
      if (!info) return null;
      return { to: info.email, ...buildDispatchNotificationEmail(info) };
    }
    case "order.cancelled": {
      const info = await getCancellationInfo(orderId);
      if (!info) return null;
      return { to: info.email, ...buildCancellationEmail(info) };
    }
    default:
      return null;
  }
}

export const emailChannel: NotificationChannel = {
  key: "email",
  configured: () => emailConfigured(),
  async send(event: NotificationEvent, ctx: NotificationContext): Promise<ChannelDispatchResult> {
    const msg = await render(event, ctx.orderId);
    if (!msg) return { channel: "email", status: "failed", error: "no data / no template for event" };
    const r = await sendEmail({ to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return r.sent
      ? { channel: "email", status: "sent", recipient: msg.to }
      : { channel: "email", status: "failed", recipient: msg.to, error: r.reason };
  },
};
