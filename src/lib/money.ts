/**
 * Money safety — the ONE numeric convention: all internal money is INTEGER PAISE
 * (₹1 = 100 paise). The commerce engine computes in paise (no float drift);
 * persistence stores paise; only the UI converts to rupees for display. Source
 * prices are whole rupees today, so `toPaise` is exact.
 */
export type Paise = number; // integer

export const toPaise = (rupees: number): Paise => Math.round(rupees * 100);
export const toRupees = (paise: Paise): number => paise / 100;

/** GST extraction in integer paise — taxable + gst, exact (Σ = inclusive). */
export function extractPaise(inclusive: Paise, rate: number): { taxable: Paise; gst: Paise } {
  const taxable = Math.round(inclusive / (1 + rate / 100));
  return { taxable, gst: inclusive - taxable };
}

const INR0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format paise as "₹899" (whole) — for prices/totals. */
export const formatPaise = (paise: Paise): string => INR0.format(paise / 100);
/** Format paise as "₹96.32" (2dp) — for taxable / GST components. */
export const formatPaise2 = (paise: Paise): string => INR2.format(paise / 100);
