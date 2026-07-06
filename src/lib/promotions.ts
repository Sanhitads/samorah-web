/**
 * Promotion engine — a generic discount layer so promotions are never hardcoded.
 * The Discovery Composition is simply the first RULE here; welcome offers,
 * festival coupons, influencer codes, free-shipping promos and future campaigns
 * plug in as additional rules without touching the money engine. Discounts are
 * allocated PER LINE (pro-rata for cart-level rules) so GST can be extracted line
 * by line. Coupons are discounts; gift cards are payment (handled downstream).
 */
import { BUNDLE_SIZE, bundleUnitPrice } from "@/lib/bundle";

export interface PromoLine {
  key: string;
  unitPrice: number; // GST-inclusive
  qty: number;
  compositionId?: string;
}

export interface AppliedPromotion {
  code: string; // "DISCOVERY_COMPOSITION" | coupon code
  label: string; // "Discovery Composition Savings (15%)"
  amount: number; // total discount (₹)
  freeShipping?: boolean;
}

export interface PromotionResult {
  discount: number; // Σ line discounts (excludes free-shipping value)
  freeShipping: boolean;
  applied: AppliedPromotion[];
  /** Discount allocated to each line key — the basis for per-line GST. */
  byLine: Record<string, number>;
}

// ── Coupon rules (config-driven; none active yet — architecture only) ─────────
export type CouponType = "percentage" | "fixed" | "free_shipping";
export interface Coupon {
  code: string;
  label: string;
  type: CouponType;
  value: number; // % for percentage, ₹ for fixed
  minSubtotal?: number;
  active: boolean;
}

/** Future marketing campaigns live here (Welcome / Festival / Influencer …). */
export const COUPONS: Coupon[] = [
  // { code: "WELCOME10", label: "Welcome Offer (10%)", type: "percentage", value: 10, minSubtotal: 999, active: false },
];

const lineTotal = (l: PromoLine) => l.unitPrice * l.qty;

/** Allocate a cart-level discount across lines pro-rata by value (last line
 *  absorbs the rounding remainder so Σ byLine === amount exactly). */
function allocatePro(amount: number, lines: PromoLine[], byLine: Record<string, number>) {
  const base = lines.reduce((s, l) => s + lineTotal(l), 0);
  if (base <= 0) return;
  let running = 0;
  lines.forEach((l, i) => {
    const share = i === lines.length - 1 ? amount - running : Math.round((amount * lineTotal(l)) / base);
    byLine[l.key] = (byLine[l.key] ?? 0) + share;
    running += share;
  });
}

/**
 * Compute all promotions for a set of lines. `couponCode` (Beat 2 UI) applies an
 * additional coupon on top of the always-on Discovery Composition rule.
 */
export function computePromotions(lines: PromoLine[], couponCode?: string): PromotionResult {
  const byLine: Record<string, number> = {};
  const applied: AppliedPromotion[] = [];
  let freeShipping = false;

  // ── Rule 1: Discovery Composition — 15% per complete set, per line ──
  const groups = new Map<string, PromoLine[]>();
  for (const l of lines) {
    if (!l.compositionId) continue;
    const g = groups.get(l.compositionId) ?? [];
    g.push(l);
    groups.set(l.compositionId, g);
  }
  let compDiscount = 0;
  for (const g of groups.values()) {
    if (g.length !== BUNDLE_SIZE) continue; // incomplete → no promotion
    for (const l of g) {
      const amt = (l.unitPrice - bundleUnitPrice(l.unitPrice)) * l.qty;
      byLine[l.key] = (byLine[l.key] ?? 0) + amt;
      compDiscount += amt;
    }
  }
  if (compDiscount > 0) {
    applied.push({ code: "DISCOVERY_COMPOSITION", label: "Discovery Composition Savings (15%)", amount: compDiscount });
  }

  // ── Rule 2: an optional coupon on top (config-driven) ──
  const coupon = couponCode ? COUPONS.find((c) => c.active && c.code === couponCode.toUpperCase()) : undefined;
  if (coupon) {
    const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
    if (!coupon.minSubtotal || subtotal >= coupon.minSubtotal) {
      if (coupon.type === "free_shipping") {
        freeShipping = true;
        applied.push({ code: coupon.code, label: coupon.label, amount: 0, freeShipping: true });
      } else {
        const already = Object.values(byLine).reduce((s, v) => s + v, 0);
        const eligible = subtotal - already; // don't discount the composition savings again
        const amt = coupon.type === "percentage" ? Math.round((eligible * coupon.value) / 100) : Math.min(coupon.value, eligible);
        if (amt > 0) {
          allocatePro(amt, lines, byLine);
          applied.push({ code: coupon.code, label: coupon.label, amount: amt });
        }
      }
    }
  }

  const discount = Object.values(byLine).reduce((s, v) => s + v, 0);
  return { discount, freeShipping, applied, byLine };
}
