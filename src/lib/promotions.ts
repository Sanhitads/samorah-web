/**
 * Promotion engine (v2) — a generic discount layer with explicit STACKING RULES,
 * so marketing stays possible. Every promotion declares priority · stackable ·
 * exclusive · combinableWith[]. Promotions are applied in a DETERMINISTIC order
 * (by priority, then a greedy compatibility check), and each application produces
 * an IMMUTABLE snapshot (name · campaign · version · rule · amount) that the
 * order persists — so months later you can explain exactly why ₹261 was taken.
 *
 * Discovery Composition is simply the first rule here. Coupons are discounts;
 * gift cards are payment (handled downstream). All amounts are in PAISE.
 */
import { BUNDLE_SIZE, bundleUnitPrice } from "@/lib/bundle";
import { toPaise } from "@/lib/money";

export interface PromoLine {
  key: string;
  unitPrice: number; // rupees (source); converted to paise here
  qty: number;
  compositionId?: string;
}

export type PromotionKind = "composition" | "percentage" | "fixed" | "free_shipping";
export interface PromotionRule {
  kind: PromotionKind;
  value?: number; // % for percentage, paise for fixed
}

/** Stacking + identity metadata every promotion declares. */
export interface PromotionMeta {
  code: string;
  label: string;
  campaign: string;
  version: string;
  priority: number; // lower = applied first (deterministic)
  stackable: boolean;
  exclusive: boolean; // true → never combines with anything else
  combinableWith: string[]; // other codes it may stack with ("*" = any stackable)
}

/** Immutable record persisted on the order. */
export interface PromotionSnapshot extends PromotionMeta {
  rule: PromotionRule;
  amount: number; // paise applied (0 for free_shipping)
  freeShipping?: boolean;
}

export interface PromotionResult {
  discount: number; // Σ line discounts, paise (excludes free-shipping value)
  freeShipping: boolean;
  applied: PromotionSnapshot[];
  skipped: { code: string; reason: string }[];
  byLine: Record<string, number>; // paise discount per line key → basis for per-line GST
}

// ── The evergreen Discovery Composition rule ──────────────────────────────────
const COMPOSITION: PromotionMeta = {
  code: "DISCOVERY_COMPOSITION",
  label: "Discovery Composition Savings (15%)",
  campaign: "evergreen",
  version: "v1",
  priority: 10,
  stackable: true,
  exclusive: false,
  combinableWith: ["FREE_SHIPPING"], // may stack with free shipping, not other % coupons
};

// ── Coupon registry (config-driven; none active — architecture only) ──────────
export interface Coupon extends PromotionMeta {
  type: Exclude<PromotionKind, "composition">;
  value: number; // % for percentage, ₹ for fixed
  minSubtotal?: number; // rupees
  active: boolean;
}
export const COUPONS: Coupon[] = [
  // { code:"WELCOME10", label:"Welcome Offer (10%)", campaign:"welcome", version:"v1", priority:20, stackable:true, exclusive:false, combinableWith:["FREE_SHIPPING"], type:"percentage", value:10, minSubtotal:999, active:false },
  // { code:"FREESHIP", label:"Free Shipping", campaign:"freeship", version:"v1", priority:30, stackable:true, exclusive:false, combinableWith:["*"], type:"free_shipping", value:0, active:false },
  // { code:"DIWALI20", label:"Diwali (20%)", campaign:"diwali", version:"v1", priority:5, stackable:false, exclusive:true, combinableWith:[], type:"percentage", value:20, active:false },
];

const linePaise = (l: PromoLine) => toPaise(l.unitPrice) * l.qty;
const isWild = (list: string[]) => list.includes("*");

/** Two promotions may stack iff both are stackable and neither exclusive, AND
 *  (either is a free-shipping promo — those never conflict with a discount — OR
 *  each lists the other in combinableWith / a wildcard). */
function canCombine(a: PromotionMeta, aKind: PromotionKind, b: PromotionMeta, bKind: PromotionKind): boolean {
  if (!a.stackable || !b.stackable || a.exclusive || b.exclusive) return false;
  if (aKind === "free_shipping" || bKind === "free_shipping") return true;
  const aOk = isWild(a.combinableWith) || a.combinableWith.includes(b.code);
  const bOk = isWild(b.combinableWith) || b.combinableWith.includes(a.code);
  return aOk && bOk;
}

/** Allocate a cart-level discount (paise) across lines pro-rata by value; the
 *  last line absorbs rounding so Σ === amount. */
function allocatePro(amount: number, lines: PromoLine[], byLine: Record<string, number>) {
  const base = lines.reduce((s, l) => s + linePaise(l), 0);
  if (base <= 0) return;
  let running = 0;
  lines.forEach((l, i) => {
    const share = i === lines.length - 1 ? amount - running : Math.round((amount * linePaise(l)) / base);
    byLine[l.key] = (byLine[l.key] ?? 0) + share;
    running += share;
  });
}

interface Candidate {
  meta: PromotionMeta;
  rule: PromotionRule;
  /** Apply into byLine/state; returns paise discount applied. */
  apply: (byLine: Record<string, number>) => { amount: number; freeShipping?: boolean };
}

/** Compute all promotions deterministically with stacking rules. */
export function computePromotions(lines: PromoLine[], couponCode?: string): PromotionResult {
  const candidates: Candidate[] = [];

  // Composition candidate — 15% per complete set, per line.
  const groups = new Map<string, PromoLine[]>();
  for (const l of lines) {
    if (!l.compositionId) continue;
    const g = groups.get(l.compositionId) ?? [];
    g.push(l);
    groups.set(l.compositionId, g);
  }
  const compGroups = [...groups.values()].filter((g) => g.length === BUNDLE_SIZE);
  if (compGroups.length) {
    candidates.push({
      meta: COMPOSITION,
      rule: { kind: "composition", value: 15 },
      apply: (byLine) => {
        let amount = 0;
        for (const g of compGroups)
          for (const l of g) {
            const amt = (toPaise(l.unitPrice) - toPaise(bundleUnitPrice(l.unitPrice))) * l.qty;
            byLine[l.key] = (byLine[l.key] ?? 0) + amt;
            amount += amt;
          }
        return { amount };
      },
    });
  }

  // Optional coupon candidate.
  const coupon = couponCode ? COUPONS.find((c) => c.active && c.code === couponCode.toUpperCase()) : undefined;
  if (coupon) {
    const subtotal = lines.reduce((s, l) => s + linePaise(l), 0);
    const eligible = !coupon.minSubtotal || subtotal >= toPaise(coupon.minSubtotal);
    if (eligible) {
      candidates.push({
        meta: coupon,
        rule: { kind: coupon.type, value: coupon.type === "free_shipping" ? undefined : coupon.value },
        apply: (byLine) => {
          if (coupon.type === "free_shipping") return { amount: 0, freeShipping: true };
          const already = Object.values(byLine).reduce((s, v) => s + v, 0);
          const base = subtotal - already;
          const amt = coupon.type === "percentage" ? Math.round((base * coupon.value) / 100) : Math.min(toPaise(coupon.value), base);
          if (amt > 0) allocatePro(amt, lines, byLine);
          return { amount: amt };
        },
      });
    }
  }

  // Deterministic order: by priority, then apply greedily respecting stacking.
  candidates.sort((a, b) => a.meta.priority - b.meta.priority);
  const byLine: Record<string, number> = {};
  const applied: PromotionSnapshot[] = [];
  const accepted: { meta: PromotionMeta; kind: PromotionKind }[] = [];
  const skipped: { code: string; reason: string }[] = [];
  let freeShipping = false;

  for (const c of candidates) {
    const clash = accepted.find((a) => !canCombine(a.meta, a.kind, c.meta, c.rule.kind));
    if (clash) {
      skipped.push({ code: c.meta.code, reason: `not combinable with ${clash.meta.code}` });
      continue;
    }
    const res = c.apply(byLine);
    if (res.freeShipping) freeShipping = true;
    accepted.push({ meta: c.meta, kind: c.rule.kind });
    applied.push({ ...c.meta, rule: c.rule, amount: res.amount, freeShipping: res.freeShipping });
  }

  const discount = Object.values(byLine).reduce((s, v) => s + v, 0);
  return { discount, freeShipping, applied, skipped, byLine };
}
