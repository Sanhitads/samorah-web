/**
 * Operating-cost validation (Admin Settings · Phase S1B) — pure, framework-free, used by BOTH the client
 * form and the server route (defense-in-depth). Messages are CORRECTIVE — they explain how to fix the value,
 * not merely that it is invalid. Only the `site_settings.costs` editable fields are validated here.
 */
export type CostField = "packagingPerOrder" | "shippingCostPerOrder" | "paymentFeePercent";

export interface CostValidationError {
  field: CostField;
  message: string;
}

export interface CostInputs {
  packagingPerOrder: number;
  shippingCostPerOrder: number;
  paymentFeePercent: number;
}

/** Returns one corrective error per invalid field (empty array = valid). NaN / empty is treated as invalid. */
export function validateCosts(costs: CostInputs): CostValidationError[] {
  const errors: CostValidationError[] = [];

  if (!(costs.packagingPerOrder >= 0)) {
    errors.push({ field: "packagingPerOrder", message: "Packaging cost can’t be negative or blank — enter 0 or a positive rupee amount (e.g. 20)." });
  }
  if (!(costs.shippingCostPerOrder >= 0)) {
    errors.push({ field: "shippingCostPerOrder", message: "Courier cost can’t be negative or blank — enter 0 or a positive rupee amount (e.g. 60)." });
  }
  if (!(costs.paymentFeePercent >= 0 && costs.paymentFeePercent <= 100)) {
    errors.push({ field: "paymentFeePercent", message: "Gateway fee must be between 0 and 100 — enter the percentage (e.g. 2 for 2%)." });
  }

  return errors;
}
