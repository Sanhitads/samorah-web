/**
 * Human-readable coupon summary (Phase 2 · point 16) — a pure FORMATTER derived from the saved/draft
 * config. It DESCRIBES; it never DETERMINES eligibility (the Phase-1 engine remains the single source of
 * truth). Also surfaces admin warnings for suspicious/incomplete configuration. Client + server safe.
 */
import { formatIST } from "@/lib/istTime";

export interface CouponSummaryTarget { mode: "include" | "exclude"; type: string; label: string }

export interface CouponSummaryInput {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount?: number | null;
  minOrder?: number | null;
  minQualifyingQuantity?: number | null;
  eligibility?: "everyone" | "first_order";
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  usedCount?: number | null;
  startsAt?: string | null; // UTC ISO
  expiresAt?: string | null; // UTC ISO
  combinable?: boolean;
  autoApply?: boolean;
  excludeSale?: boolean;
  targets?: CouponSummaryTarget[];
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Returns human-readable summary `lines` + `warnings`. Deterministic, order-stable. */
export function describeCoupon(c: CouponSummaryInput): { lines: string[]; warnings: string[] } {
  const lines: string[] = [];
  const warnings: string[] = [];
  const includes = (c.targets ?? []).filter((t) => t.mode === "include");
  const excludes = (c.targets ?? []).filter((t) => t.mode === "exclude");

  // Discount + cap.
  if (c.type === "percent") lines.push(`${c.value}% off${c.maxDiscount ? ` (up to ${rupees(c.maxDiscount)})` : ""}`);
  else if (c.type === "fixed") lines.push(`${rupees(c.value)} off`);
  else lines.push("Free shipping");

  // Applies to / exclusions.
  lines.push(includes.length ? `Applies to ${includes.map((t) => t.label).join(", ")}` : "Applies to the entire order");
  const exclusionBits = [...excludes.map((t) => t.label), ...(c.excludeSale ? ["sale items"] : [])];
  if (exclusionBits.length) lines.push(`Excludes ${exclusionBits.join(", ")}`);

  // Thresholds.
  if (c.minOrder && c.minOrder > 0) lines.push(`Minimum order ${rupees(c.minOrder)}`);
  if (c.minQualifyingQuantity && c.minQualifyingQuantity > 1) lines.push(`Minimum ${c.minQualifyingQuantity} eligible items`);

  // Eligibility + usage limits.
  if (c.eligibility === "first_order") lines.push("First-order customers only");
  if (c.maxUsesPerUser != null) lines.push(`${c.maxUsesPerUser} use${c.maxUsesPerUser === 1 ? "" : "s"} per customer`);
  if (c.maxUses != null) lines.push(`${c.maxUses} total use${c.maxUses === 1 ? "" : "s"}`);

  // Dates (IST).
  if (c.startsAt || c.expiresAt) {
    const from = c.startsAt ? formatIST(c.startsAt, { withZone: false }) : "now";
    const to = c.expiresAt ? formatIST(c.expiresAt, { withZone: false }) : "no end";
    lines.push(`Valid ${from} – ${to} IST`);
  }

  // Stacking + auto-apply.
  lines.push(c.combinable ? "Can combine with other discounts" : "Cannot combine with other promotions");
  if (c.autoApply) lines.push("Auto-applied (no code needed)");

  // ── Warnings ──
  if (!c.expiresAt) warnings.push("No expiry date — this coupon runs indefinitely once active.");
  if (c.autoApply) warnings.push("Auto-apply is on — it applies to every eligible cart without a code.");
  if (c.maxUses != null && (c.usedCount ?? 0) > c.maxUses) warnings.push(`Usage limit (${c.maxUses}) is below current redemptions (${c.usedCount}).`);
  // Same concrete target both included and excluded (exclusion would always win → dead include).
  const incKeys = new Set(includes.map((t) => `${t.type}:${t.label}`));
  if (excludes.some((t) => incKeys.has(`${t.type}:${t.label}`))) warnings.push("A target is both included and excluded — the exclusion always wins.");

  return { lines, warnings };
}
