/**
 * Transactional email kinds. All are declared up front so the architecture is
 * future-proof; only ORDER_CONFIRMATION is implemented today (the rest are wired as
 * they ship). The worker/dispatcher maps a kind → template + recipient + data.
 */
export const EMAIL_TYPES = [
  "ORDER_CONFIRMATION",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "ORDER_DISPATCHED",
  "ORDER_DELIVERED",
  "PASSWORD_RESET",
  "MAGIC_LINK",
  "WELCOME",
  "NEWSLETTER",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

/** Kinds with a built template today. */
export const IMPLEMENTED_EMAIL_TYPES: EmailType[] = ["ORDER_CONFIRMATION"];
