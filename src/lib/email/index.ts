/**
 * Email public API. Callers use `sendEmail` (via the active provider) and the
 * template builders — they never touch a provider SDK or an API key directly.
 */
import { getEmailProvider, type EmailMessage, type EmailSendResult } from "./provider";

export type { EmailProvider, EmailMessage, EmailSendResult } from "./provider";
export type { EmailType } from "./types";
export { EMAIL_TYPES, IMPLEMENTED_EMAIL_TYPES } from "./types";
export { buildOrderConfirmationEmail, type EmailOrder, type EmailItem } from "./orderConfirmation";
export { buildDispatchNotificationEmail, type DispatchEmailInput } from "./dispatchNotification";
export { buildCancellationEmail, type CancellationEmailInput, type CancellationEmailRefund } from "./cancellationNotification";
export { emailFrom, emailReplyTo } from "./config";

/** True when the active provider has credentials — the worker gates on this. */
export function emailConfigured(): boolean {
  return getEmailProvider().configured;
}

/** Send a message through the active provider (Resend today). */
export function sendEmail(msg: EmailMessage): Promise<EmailSendResult> {
  return getEmailProvider().send(msg);
}
