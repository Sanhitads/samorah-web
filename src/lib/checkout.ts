/**
 * Checkout domain (Phase 3) — the shipping/billing address + business-GST
 * contracts, and the order totals for checkout (the full GST-compliant engine
 * with the CGST/SGST vs IGST split). `calculateOrderTotals` delegates to the
 * money engine (lib/commerce.ts) — one source for cart · checkout · invoice.
 */
import { z } from "zod";
import { computeOrderTotals, toCommerceLines, type OrderTotals, type CommerceLine } from "@/lib/commerce";

export type { OrderTotals };

/** Order totals for a shipping state (place of supply). Intra-state → CGST+SGST;
 *  inter-state → IGST. `giftCard` is payment, applied after tax (Beat 2 UI). */
export function calculateOrderTotals(
  items: { key: string; name: string; price: number; qty: number; productType?: string; compositionId?: string }[],
  state?: string,
  opts?: { giftCard?: number; couponCode?: string; freeShippingThresholdInr?: number },
): OrderTotals {
  const lines: CommerceLine[] = toCommerceLines(items);
  return computeOrderTotals(lines, { state, giftCard: opts?.giftCard, couponCode: opts?.couponCode, freeShippingThresholdInr: opts?.freeShippingThresholdInr });
}

// ── Address (India) ───────────────────────────────────────────────────────────
export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  line1: z.string().trim().min(3, "Enter your address"),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter your city"),
  state: z.string().trim().min(2, "Select your state"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
});
export type AddressForm = z.infer<typeof addressSchema>;

/** GSTIN — 15 chars: 2 state + 10 PAN + 1 entity + 'Z' + 1 checksum. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/;
export const businessSchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name"),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, "Enter a valid 15-character GSTIN"),
});
export type BusinessForm = z.infer<typeof businessSchema>;

/** Validate a form against a schema → field errors (empty when valid). */
export function fieldErrors<T>(schema: z.ZodType<T>, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Back-compat helper (shipping address). */
export const validateAddress = (values: Partial<AddressForm>) => fieldErrors(addressSchema, values);

// ── PIN ↔ state cross-check (place-of-supply integrity) ───────────────────────
// A wrong state dropdown vs the PIN would compute CGST/SGST instead of IGST → an
// illegal invoice. We map the high-confidence 2-digit PIN prefixes to their state
// and flag only a CONFIDENT mismatch (unknown prefixes never block).
const range = (from: number, to: number, state: string): [string, string][] => {
  const out: [string, string][] = [];
  for (let n = from; n <= to; n++) out.push([String(n).padStart(2, "0"), state]);
  return out;
};
export const PIN_STATE: Record<string, string> = Object.fromEntries([
  ["11", "Delhi"],
  ["17", "Himachal Pradesh"],
  ...range(30, 34, "Rajasthan"),
  ...range(36, 39, "Gujarat"),
  ...range(40, 44, "Maharashtra"),
  ...range(56, 59, "Karnataka"),
  ...range(60, 64, "Tamil Nadu"),
  ...range(67, 69, "Kerala"),
  ...range(70, 74, "West Bengal"),
  ["78", "Assam"],
]);

/** True when the PIN's region confidently belongs to a DIFFERENT state. */
export function pinStateMismatch(pin: string, state: string): boolean {
  if (!/^\d{6}$/.test(pin) || !state) return false;
  const expected = PIN_STATE[pin.slice(0, 2)];
  return Boolean(expected) && expected.toLowerCase() !== state.trim().toLowerCase();
}
