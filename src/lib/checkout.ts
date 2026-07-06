/**
 * Checkout domain (Phase 3 · Beat 1) — the GST-accurate order totals and the
 * shipping-address contract. Extends the shared cart summary with the CGST/SGST
 * vs IGST split (place-of-supply), so cart · checkout · invoice read one source.
 * Money is GST-inclusive; GST is extracted, never added.
 */
import { z } from "zod";
import { GST_RATE, STORE_STATE } from "@/config/commerce";
import { gstBreakdown } from "@/lib/pricing";
import { buildCartSummary, type CartSummary } from "@/lib/cart";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase();

export interface OrderTotals extends CartSummary {
  taxableValue: number; // pre-tax value extracted from the inclusive total
  interState: boolean; // place-of-supply ≠ store state → IGST
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Full order totals for a shipping state. Intra-state splits the embedded GST
 * into CGST + SGST; inter-state books it all as IGST (BRD P11/P12). No state yet
 * (address incomplete) → treated as intra-state for a provisional display.
 */
export function calculateOrderTotals(
  subtotal: number,
  discount: number,
  customerState?: string,
): OrderTotals {
  const s = buildCartSummary(subtotal, discount);
  const { taxable } = gstBreakdown(s.goodsTotal + s.shipping, GST_RATE);
  const interState = customerState ? norm(customerState) !== norm(STORE_STATE) : false;
  const cgst = interState ? 0 : round2(s.gst / 2);
  const sgst = interState ? 0 : round2(s.gst - cgst);
  const igst = interState ? s.gst : 0;
  return { ...s, taxableValue: taxable, interState, cgst, sgst, igst };
}

/** Shipping address — validated at the checkout boundary (India). */
export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  line1: z.string().trim().min(3, "Enter your address"),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter your city"),
  state: z.string().trim().min(2, "Select your state"),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
});

export type AddressForm = z.infer<typeof addressSchema>;

/** Validate a partial address form → field errors (empty when valid). */
export function validateAddress(values: Partial<AddressForm>): Record<string, string> {
  const result = addressSchema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
