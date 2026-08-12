/**
 * Shipping-config validation (Admin Settings) — pure, framework-free; used by BOTH the client form and
 * the server route (defense-in-depth), mirroring the S1B cost- and S2A dispatch-validation patterns.
 * Messages are CORRECTIVE. Validates only the `site_settings.shipping` fields.
 *
 * This value is money-critical: the same free-shipping threshold drives the checkout charge, the cart's
 * free-shipping hint, and the policy/product copy — so it must be a clean whole-rupee amount.
 */
export type ShippingField = "freeThreshold";

export interface ShippingValidationError {
  field: ShippingField;
  message: string;
}

export interface ShippingInputs {
  freeThreshold: number;
}

const MAX_THRESHOLD = 1_000_000; // ₹10,00,000 — a generous sane upper bound

/** One corrective error per invalid field (empty array = valid). */
export function validateShipping(s: ShippingInputs): ShippingValidationError[] {
  const errors: ShippingValidationError[] = [];

  if (!(Number.isFinite(s.freeThreshold) && Number.isInteger(s.freeThreshold) && s.freeThreshold >= 0 && s.freeThreshold <= MAX_THRESHOLD)) {
    errors.push({ field: "freeThreshold", message: `Free-shipping threshold must be a whole number of rupees between 0 and ${MAX_THRESHOLD.toLocaleString("en-IN")} — enter e.g. 1499 (0 means everything ships free).` });
  }

  return errors;
}
