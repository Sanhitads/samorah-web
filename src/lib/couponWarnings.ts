/**
 * Operational warnings (Phase 3 · point 25) — severity-aware, pure/testable.
 *
 * This module only FORMATS warnings from pre-resolved facts. The facts themselves are produced by
 * the canonical promotion engine (couponEligibleLines / canCombine / validateCouponForActivation) in
 * couponWarningsService — this file never re-implements targeting or stacking logic.
 *
 * Design rules (merchant-locked):
 *  • Severity: critical (operationally broken) · warning (needs attention soon) · info (non-urgent).
 *  • Never duplicate what the status badge already says: expired/exhausted/archived get NO warnings.
 *  • Avoid noise: only live (active) coupons raise criticals; scheduled coupons raise the same catalog
 *    issues as warnings (fix before launch); paused/draft stay quiet.
 *  • The expiry threshold is centralized here so it can become configurable later.
 */

/** Centralized thresholds — change here only (future: per-merchant config). */
export const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000; // 24h
export const NEAR_LIMIT_RATIO = 0.9; // ≥90% of capacity consumed

export type WarningSeverity = "critical" | "warning" | "info";
export interface CouponWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
}

/** Pre-resolved facts about one coupon (computed by the service using canonical engine functions). */
export interface WarningFacts {
  effectiveStatus: string; // couponStatus().status — active|scheduled|paused|draft|expired|exhausted|archived
  autoApply: boolean;
  expiresAt: string | null; // ISO UTC
  usedCount: number; // includes live reservations (capacity accounting)
  maxUses: number | null;
  invalidReason: string | null; // validateCouponForActivation first error (null if valid)
  eligibleProductCount: number; // couponEligibleLines(activeCatalog, coupon).length
  archivedTargetLabels: string[]; // include-targets pointing to archived/missing catalog entities
  conflictsWith: string[]; // codes of other live auto-apply coupons it can't combine with AND overlaps
  hasIncludes: boolean; // false ⇒ targets the entire catalogue
  nowMs: number; // injected clock (tests + determinism)
}

/**
 * Build the severity-ranked warning list for a coupon. Empty when there is nothing actionable.
 * Only `active` and `scheduled` coupons produce operational warnings; the status badge covers the rest.
 */
export function buildCouponWarnings(f: WarningFacts): CouponWarning[] {
  const live = f.effectiveStatus === "active";
  const upcoming = f.effectiveStatus === "scheduled";
  if (!live && !upcoming) return []; // expired/exhausted/archived/paused/draft → badge/no-noise

  const out: CouponWarning[] = [];
  // Catalog/config integrity — CRITICAL when live, WARNING when merely scheduled.
  const catalogSeverity: WarningSeverity = live ? "critical" : "warning";

  if (live && f.invalidReason) {
    out.push({ severity: "critical", code: "invalid_config", message: `Invalid configuration: ${f.invalidReason}` });
  }
  if (f.eligibleProductCount === 0) {
    out.push({ severity: catalogSeverity, code: "no_eligible_products", message: "Targets no eligible products — this coupon can never apply." });
  }
  if (live && f.conflictsWith.length) {
    out.push({ severity: "critical", code: "auto_conflict", message: `Auto-apply conflicts with ${f.conflictsWith.join(", ")} — both target overlapping carts and can't stack.` });
  }
  if (f.archivedTargetLabels.length) {
    out.push({ severity: "warning", code: "archived_target", message: `Targets archived/removed: ${f.archivedTargetLabels.join(", ")}.` });
  }

  // Capacity — uses used_count (reservations count against capacity). Exhausted is left to the badge.
  if (f.maxUses != null && f.maxUses > 0) {
    const ratio = f.usedCount / f.maxUses;
    if (ratio >= NEAR_LIMIT_RATIO && ratio < 1) {
      out.push({ severity: "warning", code: "near_limit", message: `${Math.round(ratio * 100)}% of capacity used (${f.usedCount}/${f.maxUses}).` });
    }
  }

  // Expiry proximity.
  if (f.expiresAt) {
    const ms = Date.parse(f.expiresAt) - f.nowMs;
    if (ms > 0 && ms <= EXPIRY_WARNING_MS) {
      const hrs = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
      out.push({ severity: "warning", code: "expiring_soon", message: `Expires in ~${hrs}h.` });
    }
  } else if (live) {
    out.push({ severity: "info", code: "no_expiry", message: "No expiry date — runs indefinitely." });
  }

  // Broad targeting (info only, live).
  if (live && !f.hasIncludes) {
    out.push({ severity: "info", code: "broad_targeting", message: "Applies to the entire catalogue (no product targeting)." });
  }

  const rank: Record<WarningSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The worst severity present (for the list's single warning chip / Operational Health filter). */
export function topSeverity(warnings: CouponWarning[]): WarningSeverity | null {
  if (warnings.some((w) => w.severity === "critical")) return "critical";
  if (warnings.some((w) => w.severity === "warning")) return "warning";
  if (warnings.some((w) => w.severity === "info")) return "info";
  return null;
}
