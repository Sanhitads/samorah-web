/**
 * Financial Health assessment (Stage R2) — pure, framework-free. Maps EXISTING system conditions to a
 * severity so the Financial Health banner can warn when a report's trustworthiness is affected. It performs
 * NO new business logic and NO financial calculation — it only reads values already produced by the
 * canonical engine (R1A) + existing site settings and classifies them.
 *
 * Severity: attention (materially overstated/unreliable) > warning (a configured input missing) > healthy.
 * `info` items are context (not defects) and never raise the overall severity above healthy on their own.
 */
export type HealthSeverity = "healthy" | "warning" | "attention";
export type ItemSeverity = "info" | "warning" | "attention";
export interface HealthItem { severity: ItemSeverity; text: string }
export interface FinancialHealth { severity: HealthSeverity; items: HealthItem[] }

export interface HealthInputs {
  variantsMissingCost: number; // from engine — sold variants with no cost price
  revenue: number;             // canonical revenue (after refunds)
  gstCollected: number;        // GST memo
  refunds: number;             // refunds subtracted
  shippingCostPerOrder: number; // Settings → Operating costs
  paymentFeePercent: number;    // Settings → Operating costs
}

export function assessFinancialHealth(i: HealthInputs): FinancialHealth {
  const items: HealthItem[] = [];

  if (i.variantsMissingCost > 0) {
    items.push({ severity: "attention", text: `${i.variantsMissingCost} product variant${i.variantsMissingCost === 1 ? " has" : "s have"} no cost price — COGS and Operating Profit are optimistic.` });
  }
  if (i.shippingCostPerOrder === 0) {
    items.push({ severity: "warning", text: "Courier shipping cost is not configured (Settings → Operating costs) — profit excludes courier expense." });
  }
  if (i.paymentFeePercent === 0) {
    items.push({ severity: "warning", text: "Payment gateway fee is not configured — profit excludes gateway fees." });
  } else {
    items.push({ severity: "info", text: `Gateway fees are estimated at ${i.paymentFeePercent}% of paid order value, not reconciled to actual settlements.` });
  }
  if (i.revenue > 0 && i.gstCollected === 0) {
    items.push({ severity: "warning", text: "No GST recorded on paid orders — verify tax configuration." });
  }
  if (i.refunds > 0) {
    items.push({ severity: "info", text: "Refunds are subtracted at gross (GST not apportioned in v1) — revenue is deliberately conservative." });
  }

  const severity: HealthSeverity = items.some((x) => x.severity === "attention")
    ? "attention"
    : items.some((x) => x.severity === "warning")
      ? "warning"
      : "healthy";
  return { severity, items };
}
