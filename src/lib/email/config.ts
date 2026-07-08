import { COMMERCE } from "@/config/commerce";
import { SITE_CONFIG } from "@/config/site";

/**
 * Sender identity — env-driven, never hardcoded. Defaults to a personal `hello@`
 * brand address (luxury feel), NOT a `no-reply@`. Reply-To always points at a
 * monitored inbox so replies reach a human.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || `${COMMERCE.brandName} <hello@${SITE_CONFIG.primaryDomain}>`;
}

export function emailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || `hello@${SITE_CONFIG.primaryDomain}`;
}
