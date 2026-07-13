/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Customer account audit trail (review point 9). SEPARATE from analytics (product
 * funnel, GA) and from audit_events (staff/admin actions). This is the customer's own
 * account event history for support + compliance — login/logout/password/email/profile/
 * address/wishlist/newsletter changes. Admin/CS visible; not exposed to customers in the
 * storefront UI. Non-blocking (an audit failure never breaks the action).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type AccountEvent =
  | "login" | "logout" | "password_change" | "email_change"
  | "profile_update" | "address_change" | "wishlist_change" | "newsletter_change";

export async function logAccountEvent(userId: string, event: AccountEvent, opts: { metadata?: Record<string, unknown>; ipHash?: string | null } = {}): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db.from("account_audit_log").insert({ user_id: userId, event, metadata: opts.metadata ?? null, ip_hash: opts.ipHash ?? null });
  } catch (e) {
    console.error("logAccountEvent failed (non-fatal)", e);
  }
}

export interface AccountAuditRow { event: string; metadata: any; createdAt: string }

/** Recent account events for a customer — for the CRM Customer 360 + CS. */
export async function getAccountAudit(userId: string, limit = 40): Promise<AccountAuditRow[]> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("account_audit_log").select("event,metadata,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((r: any) => ({ event: r.event, metadata: r.metadata, createdAt: r.created_at }));
  } catch { return []; }
}
