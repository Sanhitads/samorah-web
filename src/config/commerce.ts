/**
 * Central commerce configuration — the SINGLE source of truth for every
 * financial / legal / tax / shipping value. Cart · Checkout · Orders · Invoice ·
 * Emails · Razorpay · Admin all read from here; nothing is hardcoded elsewhere.
 * Money is stored GST-INCLUSIVE (MRP); GST is *extracted*, never added on top.
 */

// ── Brand / legal identity (confirm before the first live invoice) ────────────
export const COMMERCE = {
  brandName: "SAMORAH",
  legalName: "SANHITA DAS", // registered (proprietor) legal name — prints on invoice
  tradeName: "M/s Samorah",
  constitution: "Proprietorship",
  gstin: "29BCZPD3150Q1ZS", // 29 = Karnataka
  registeredAddress: {
    line1: "1383/433, 3rd Floor, Dex Co Work, 5th B Main Road",
    line2: "HBR Layout",
    city: "Bengaluru",
    district: "Bengaluru Urban",
    state: "Karnataka",
    pincode: "560045",
    country: "India",
  },
  /** Place of supply. Intra-state → CGST+SGST; inter-state → IGST. */
  registeredState: "Karnataka",
  currency: "INR",
  currencySymbol: "₹",

  support: {
    email: "care@samorah.example", // TODO confirm
    phone: "+91 00000 00000", // TODO confirm
  },

  policy: {
    /** Days after delivery a return/exchange is accepted (handcrafted — narrow). */
    returnWindowDays: 2,
    cancellation: "Orders may be cancelled before dispatch. Once shipped, our returns policy applies.",
    /** An order may be cancelled by the customer up to (and including) this status. */
    cancellableUntil: "packed" as const,
    termsHref: "/terms",
    privacyHref: "/privacy",
    shippingReturnsHref: "/shipping",
  },
} as const;

/** Stock is held this long after create-order; the expiry cron releases it. */
export const RESERVATION_TTL_MINUTES = 15;

// ── Tax (per HSN — never a single global rate) ────────────────────────────────
export interface TaxClass {
  hsn: string;
  gstRate: number; // %
  label: string;
}

/**
 * GST tax class per product type. Every line resolves its rate from HERE, so
 * candles (12%) and sprays (18%) are computed correctly in one cart. When product
 * variants gain their own HSN/rate columns (Beat 2), this becomes the fallback.
 * Confirm all HSN/rates with a CA (BRD §9.1).
 */
export const TAX_CLASSES: Record<string, TaxClass> = {
  candle: { hsn: "3406", gstRate: 12, label: "Scented Candle" },
  room_spray: { hsn: "3307", gstRate: 18, label: "Room Spray" },
  linen_spray: { hsn: "3307", gstRate: 18, label: "Linen Spray" },
  wax_melt: { hsn: "3406", gstRate: 12, label: "Wax Melt" },
  accessory: { hsn: "9603", gstRate: 18, label: "Accessory" },
  gift_set: { hsn: "3406", gstRate: 12, label: "Gift Set" },
};
export const DEFAULT_TAX_CLASS = "candle";

/** Shipping is a taxable service (HSN 9968). GST on shipping follows the
 *  principal supply rate (composite supply) — resolved per-cart, not fixed. */
export const SHIPPING_HSN = "9968";

/**
 * Version stamps frozen on every order (forensic provenance — two years later you
 * know exactly which rules produced an invoice). Bump the relevant one when its
 * inputs change; old orders keep their stamps and never recompute.
 *   · TAX_VERSION      — the HSN/rate table (TAX_CLASSES). Bump on any rate change.
 *   · PRICING_VERSION  — pricing rules: shipping thresholds + promotion config.
 *   · COMMERCE_ENGINE_VERSION — the calculation ENGINE (lib/commerce.ts). Bump on
 *     any change to the pipeline / rounding / allocation logic (semver).
 */
export const TAX_VERSION = "GST_2026_01";
export const PRICING_VERSION = "PRICE_2026_07";
export const COMMERCE_ENGINE_VERSION = "1.0";

/** @deprecated single-rate shim — kept only for legacy callers; use TAX_CLASSES. */
export const GST_RATE = TAX_CLASSES.candle.gstRate;
export const STORE_STATE = COMMERCE.registeredState;

// ── Shipping ──────────────────────────────────────────────────────────────────
export const SHIPPING = {
  /** Free standard shipping at or above this order value (₹). */
  freeThreshold: 1499,
  /** Flat standard rate below the threshold (₹) — the fallback until Shiprocket. */
  flatRate: 99,
};

/** Estimated standard shipping for a goods total (post-discount). The Shiprocket
 *  rate API (Beat 2) becomes the real implementation; this stays the fallback. */
export function estimateShipping(goodsTotal: number): number {
  if (goodsTotal <= 0) return 0;
  return goodsTotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.flatRate;
}

/** The free-shipping threshold as a formatted rupee string ("₹1,499"). */
export function freeShippingLabel(): string {
  return `${COMMERCE.currencySymbol}${SHIPPING.freeThreshold.toLocaleString("en-IN")}`;
}

/** The one canonical shipping sentence read by every surface. */
export function shippingPolicySentence(): string {
  return `Complimentary standard shipping within India on orders over ${freeShippingLabel()}.`;
}

// ── Invoice (Financial-Year numbering — allocated on payment success) ─────────
export const INVOICE = {
  prefix: "SAM",
  /** India FY starts 1 April → "26-27". */
  financialYear(date: Date): string {
    const y = date.getUTCFullYear();
    const startYear = date.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
    return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
  },
  /** SAM/26-27/000001 — sequence is per-FY, allocated in the webhook txn (Beat 2). */
  format(fy: string, seq: number): string {
    return `${INVOICE.prefix}/${fy}/${String(seq).padStart(6, "0")}`;
  },
};

// ── Razorpay (Beat 2) — keys live in env, referenced here only ────────────────
export const RAZORPAY = {
  keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
  // secret + webhook secret are server-only (never NEXT_PUBLIC_):
  keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  // Our merchant/account id ("acc_XXXX") — when set, webhook events are checked
  // against it so a stray event for another account is rejected (defence-in-depth).
  accountId: process.env.RAZORPAY_ACCOUNT_ID ?? "",
  get configured() {
    return Boolean(this.keyId && this.keySecret);
  },
};

// ── Places of supply ──────────────────────────────────────────────────────────
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman & Nicobar Islands", "Chandigarh", "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;
