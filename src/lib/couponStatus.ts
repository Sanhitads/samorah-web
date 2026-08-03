/**
 * Canonical coupon lifecycle status (Phase 2 · point 12) — the ONE shared derivation used by admin,
 * pricing, repricing and reservation so nothing disagrees. Stored INTENT (draft|active|paused|archived)
 * always wins; scheduled/expired/exhausted are DERIVED (never stored) only when the intent is `active`.
 *
 * Deterministic precedence (explicit admin intent first, then temporal, then usage):
 *   archived → draft → paused → [active-intent: scheduled → expired → exhausted → active]
 *
 * Boundary (locked): starts_at INCLUSIVE, expires_at EXCLUSIVE → live window is `starts_at <= now < expires_at`.
 */
import { formatIST } from "@/lib/istTime";

export type CouponLifecycle = "draft" | "active" | "paused" | "archived";
export type CouponEffectiveStatus = "draft" | "scheduled" | "active" | "paused" | "expired" | "exhausted" | "archived";

export interface CouponStatusInput {
  status: CouponLifecycle;
  startsAt?: string | null; // UTC ISO
  expiresAt?: string | null; // UTC ISO
  maxUses?: number | null;
  usedCount?: number | null;
}

export interface CouponStatusResult {
  status: CouponEffectiveStatus;
  /** Human-readable explanation for the admin, e.g. "Expired 20 Aug 2026, 11:59 PM IST". */
  reason: string;
}

export function couponStatus(c: CouponStatusInput, now: Date = new Date()): CouponStatusResult {
  // 1) Explicit administrative intent wins first.
  if (c.status === "archived") return { status: "archived", reason: "Archived — retired campaign" };
  if (c.status === "draft") return { status: "draft", reason: "Draft — not published" };
  if (c.status === "paused") return { status: "paused", reason: "Paused — temporarily stopped" };

  // 2) Intent is `active` → derive temporal, then usage.
  const t = now.getTime();
  const starts = c.startsAt ? new Date(c.startsAt).getTime() : null;
  const expires = c.expiresAt ? new Date(c.expiresAt).getTime() : null;
  if (starts != null && starts > t) return { status: "scheduled", reason: `Scheduled — starts ${formatIST(c.startsAt)}` };
  if (expires != null && expires <= t) return { status: "expired", reason: `Expired ${formatIST(c.expiresAt)}` };
  const used = c.usedCount ?? 0;
  if (c.maxUses != null && used >= c.maxUses) return { status: "exhausted", reason: `${used} / ${c.maxUses} redemptions used` };

  return { status: "active", reason: c.expiresAt ? `Active — valid until ${formatIST(c.expiresAt)}` : "Active" };
}

/** Live for pricing/redemption RIGHT NOW: intent `active`, within window, under cap. The single predicate
 *  every authoritative path (loadCouponRegistry / validateCoupon / reserve) should use. */
export function couponIsLive(c: CouponStatusInput, now: Date = new Date()): boolean {
  return couponStatus(c, now).status === "active";
}
