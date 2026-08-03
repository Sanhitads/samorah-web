/**
 * Coupon config validation (Phase 1 · point 7) — a SINGLE pure validator shared by the admin client
 * (instant feedback) and the server API (authoritative). No DB, no server-only imports, so it runs
 * identically in both places. Duplicate-code and referential checks that need the DB stay at the DB
 * layer (unique constraint + FK); this covers everything decidable from the input alone.
 */
export type CouponConfigType = "percent" | "fixed" | "free_shipping";

export interface CouponTargetInput {
  type: "category" | "collection" | "product" | "product_type" | "variant";
  id?: string | null;
  value?: string | null;
}

export interface CouponConfigInput {
  code: string;
  type: CouponConfigType;
  value: number;
  maxDiscount?: number | null;
  minOrder?: number | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  includes?: CouponTargetInput[];
  excludes?: CouponTargetInput[];
}

/** Canonical coupon code — trimmed + upper-cased, so `welcome10` and `WELCOME10` are never two coupons. */
export function normalizeCouponCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const targetKey = (t: CouponTargetInput) => `${t.type}:${t.id ?? t.value ?? ""}`;
const validDate = (s: string) => !Number.isNaN(new Date(s).getTime());
const neg = (v: number | null | undefined) => v != null && v < 0;

/**
 * DRAFT validation (Phase 2 · point 7) — lenient: a draft may be INCOMPLETE (no dates, no description,
 * unfinished targeting). Only rejects values that can never be valid (also enforced by DB CHECKs). Reuses
 * the same primitives as the strict validator — no duplicated business rules.
 */
export function validateCouponDraft(input: CouponConfigInput): string[] {
  const errors: string[] = [];
  const code = normalizeCouponCode(input.code);
  if (!code) errors.push("Code is required.");
  else if (!/^[A-Z0-9_-]{2,40}$/.test(code)) errors.push("Code must be 2–40 characters: letters, numbers, hyphens or underscores.");
  if (input.type === "percent" && isFiniteNum(input.value) && input.value > 100) errors.push("Percentage cannot exceed 100.");
  if (neg(input.value)) errors.push("Value cannot be negative.");
  if (neg(input.maxDiscount)) errors.push("Maximum discount cannot be negative.");
  if (neg(input.minOrder)) errors.push("Minimum order cannot be negative.");
  if (neg(input.maxUses)) errors.push("Maximum uses cannot be negative.");
  if (neg(input.maxUsesPerUser)) errors.push("Per-customer limit cannot be negative.");
  return errors;
}

/** ACTIVATION validation (Phase 2 · point 7) — STRICT readiness. The full config validator: rejects
 *  contradictions and unsafe/incomplete campaigns with actionable errors. (Same primitives; no dup logic.) */
export function validateCouponForActivation(input: CouponConfigInput): string[] {
  return validateCouponConfig(input);
}

/** Returns a list of human-readable errors; empty array = valid. Deterministic, order-stable. */
export function validateCouponConfig(input: CouponConfigInput): string[] {
  const errors: string[] = [];
  const code = normalizeCouponCode(input.code);
  if (!code) errors.push("Code is required.");
  else if (!/^[A-Z0-9_-]{2,40}$/.test(code)) errors.push("Code must be 2–40 characters: letters, numbers, hyphens or underscores.");

  // Discount value by type.
  if (input.type === "percent") {
    if (!isFiniteNum(input.value) || input.value <= 0) errors.push("Percentage must be greater than 0.");
    else if (input.value > 100) errors.push("Percentage cannot exceed 100.");
  } else if (input.type === "fixed") {
    if (!isFiniteNum(input.value) || input.value <= 0) errors.push("Fixed amount must be greater than 0.");
  }
  // free_shipping: value is meaningless and ignored (persisted as 0).

  // Caps / limits — never negative; the % cap is meaningful only for percentage coupons.
  if (input.maxDiscount != null && input.maxDiscount < 0) errors.push("Maximum discount cannot be negative.");
  if (input.type !== "percent" && input.maxDiscount != null && input.maxDiscount > 0) {
    errors.push("Maximum-discount cap applies only to percentage coupons.");
  }
  if (input.minOrder != null && input.minOrder < 0) errors.push("Minimum order cannot be negative.");
  if (input.maxUses != null && input.maxUses < 0) errors.push("Maximum uses cannot be negative.");
  if (input.maxUsesPerUser != null && input.maxUsesPerUser < 0) errors.push("Per-customer limit cannot be negative.");

  // Dates — valid + expiry strictly after start.
  if (input.startsAt && !validDate(input.startsAt)) errors.push("Start date is invalid.");
  if (input.expiresAt && !validDate(input.expiresAt)) errors.push("Expiry date is invalid.");
  if (input.startsAt && input.expiresAt && validDate(input.startsAt) && validDate(input.expiresAt) &&
      new Date(input.expiresAt).getTime() <= new Date(input.startsAt).getTime()) {
    errors.push("Expiry must be after the start date.");
  }

  // Contradictory targeting — the same concrete target can't be both included and excluded.
  if (input.includes?.length && input.excludes?.length) {
    const inc = new Set(input.includes.map(targetKey));
    for (const e of input.excludes) {
      if (inc.has(targetKey(e))) { errors.push("A target can't be both included and excluded."); break; }
    }
  }

  return errors;
}
