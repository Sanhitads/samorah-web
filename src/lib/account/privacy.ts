import { createHash } from "node:crypto";

/**
 * Privacy (review point 10) — we never store a raw IP. hashIp() is a salted SHA-256
 * so the same IP correlates (fraud/support) without being reversible or PII-heavy.
 * Coarse country is kept separately for support context.
 */
const SALT = process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "samorah-ip-salt";

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  return createHash("sha256").update(`${ip}${SALT}`).digest("hex").slice(0, 32);
}
