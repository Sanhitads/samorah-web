import { emailFrom, emailReplyTo } from "./config";

/**
 * Email provider abstraction. The app only depends on the `EmailProvider`
 * interface, so switching Resend → Mailgun/SES/SMTP later is a one-line factory
 * change with no caller impact. API keys are read from env inside the provider —
 * never hardcoded, never passed around.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text alternative (multipart) — better spam score + a11y
  from?: string; // defaults to emailFrom()
  replyTo?: string; // defaults to emailReplyTo()
}
export interface EmailSendResult {
  sent: boolean;
  reason?: string;
}
export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

/** Resend via its REST API (no SDK dependency). */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  get configured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { sent: false, reason: "resend not configured" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: msg.from ?? emailFrom(),
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          ...(msg.text ? { text: msg.text } : {}),
          reply_to: msg.replyTo ?? emailReplyTo(),
        }),
      });
      if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 180)}` };
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: e instanceof Error ? e.message : "error" };
    }
  }
}

// Future providers — implement the interface and add a case below.
// class MailgunProvider implements EmailProvider { ... }
// class SesProvider implements EmailProvider { ... }
// class SmtpProvider implements EmailProvider { ... }

/** The active provider, selected by EMAIL_PROVIDER (default: resend). */
export function getEmailProvider(): EmailProvider {
  const name = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  switch (name) {
    case "resend":
      return new ResendProvider();
    // case "mailgun": return new MailgunProvider();
    // case "ses":     return new SesProvider();
    // case "smtp":    return new SmtpProvider();
    default:
      return new ResendProvider();
  }
}
