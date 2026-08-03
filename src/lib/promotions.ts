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
  // Coupon-targeting identifiers (Phase 1) — optional; used by targeting/exclusion matching only.
  productId?: string;
  categoryId?: string;
  collectionId?: string;
  productType?: string;
  variantId?: string;
  onSale?: boolean;
  isGiftCard?: boolean;
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
/** A single applies-to / exclusion rule, matched against a line's identifiers (Phase 1 · points 2/3).
 *  ID-backed types carry `id`; product_type carries the canonical `value` string. */
export type CouponTargetType = "category" | "collection" | "product" | "product_type" | "variant";
export interface CouponTarget {
  type: CouponTargetType;
  id?: string; // category/collection/product/variant id
  value?: string; // product_type canonical string
}
export interface Coupon extends PromotionMeta {
  type: Exclude<PromotionKind, "composition">;
  value: number; // % for percentage, ₹ for fixed
  minSubtotal?: number; // rupees
  maxDiscount?: number; // rupees — cap for percentage coupons (0/undefined = no cap)
  active: boolean;
  // Targeting (Phase 1 · points 2/3). Empty/undefined `includes` = ENTIRE eligible order (unchanged
  // behaviour). Explicit `excludes` ALWAYS win over includes. `excludeSale` drops sale-priced lines.
  // Gift cards and bundle/composition lines are excluded INTRINSICALLY by the engine (no config needed).
  includes?: CouponTarget[];
  excludes?: CouponTarget[];
  excludeSale?: boolean;
}

/** Does a line satisfy a single target rule? */
function lineMatchesTarget(l: PromoLine, t: CouponTarget): boolean {
  switch (t.type) {
    case "category": return !!l.categoryId && l.categoryId === t.id;
    case "collection": return !!l.collectionId && l.collectionId === t.id;
    case "product": return !!l.productId && l.productId === t.id;
    case "variant": return !!l.variantId && l.variantId === t.id;
    case "product_type": return !!l.productType && l.productType === t.value;
    default: return false;
  }
}

/** The lines a coupon may discount (points 2/3/11). Order of precedence, exclusions ALWAYS winning:
 *   1. gift-card lines — never discounted by ordinary coupons (separate financial instrument);
 *   2. bundle/composition lines — excluded from ordinary coupons by default (identified by compositionId);
 *   3. sale-priced lines when `excludeSale`;
 *   4. any explicit `excludes` rule;
 *   5. then `includes` — empty = every remaining line; else must match an include rule. */
export function couponEligibleLines(lines: PromoLine[], c: Coupon): PromoLine[] {
  return lines.filter((l) => {
    if (l.isGiftCard) return false;
    if (l.compositionId) return false;
    if (c.excludeSale && l.onSale) return false;
    if (c.excludes?.some((t) => lineMatchesTarget(l, t))) return false;
    if (c.includes && c.includes.length) return c.includes.some((t) => lineMatchesTarget(l, t));
    return true;
  });
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

/** Compute all promotions deterministically with stacking rules. `coupons` is the
 *  active registry — the server injects the DB-loaded set; defaults to config. */
export function computePromotions(lines: PromoLine[], couponCode?: string, coupons: Coupon[] = COUPONS): PromotionResult {
  const candidates: Candidate[] = [];
  // Codes that never even entered the running (vs. those skipped for a stacking clash below).
  // Reported so callers can say WHY a code stopped applying instead of guessing "not recognised".
  const preSkipped: { code: string; reason: string }[] = [];

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
  const coupon = couponCode ? coupons.find((c) => c.active && c.code === couponCode.toUpperCase()) : undefined;
  if (coupon) {
    const subtotal = lines.reduce((s, l) => s + linePaise(l), 0);
    // Min-order gates on the WHOLE cart subtotal (an order minimum), not the targeted subset.
    const meetsMin = !coupon.minSubtotal || subtotal >= toPaise(coupon.minSubtotal);
    // Targeting/exclusions (points 2/3): the lines this coupon may actually discount.
    const eligibleLines = couponEligibleLines(lines, coupon);
    if (!meetsMin) {
      // Real case: a coupon applied to a 3-item cart, then an item is removed and the cart drops
      // below the minimum. The money is already right (no candidate ⇒ no discount) — this is so the
      // UI can explain it rather than claim the code is unknown.
      preSkipped.push({ code: coupon.code, reason: `minimum order of ₹${(coupon.minSubtotal ?? 0).toLocaleString("en-IN")} not met` });
    } else if (coupon.type !== "free_shipping" && eligibleLines.length === 0) {
      // Targeted/excluded coupon with nothing to apply to → zero benefit, clear reason (point 8 feeds
      // on this: a ₹0-benefit coupon must not be recorded as redeemed).
      preSkipped.push({ code: coupon.code, reason: "no items in your bag qualify for this code" });
    } else {
      candidates.push({
        meta: coupon,
        rule: { kind: coupon.type, value: coupon.type === "free_shipping" ? undefined : coupon.value },
        apply: (byLine) => {
          if (coupon.type === "free_shipping") return { amount: 0, freeShipping: true };
          // Base = eligible lines only, net of any discount already allocated to them (points 3/11).
          const eligibleBase = eligibleLines.reduce((s, l) => s + linePaise(l) - (byLine[l.key] ?? 0), 0);
          let amt = coupon.type === "percentage" ? Math.round((eligibleBase * coupon.value) / 100) : Math.min(toPaise(coupon.value), eligibleBase);
          // Percentage cap (e.g. "20% up to ₹500") — applies to the eligible-subset discount.
          if (coupon.type === "percentage" && coupon.maxDiscount) amt = Math.min(amt, toPaise(coupon.maxDiscount));
          amt = Math.max(0, amt);
          // Allocate across ELIGIBLE lines only → excluded/non-targeted lines get exactly ₹0 (point 11).
          if (amt > 0) allocatePro(amt, eligibleLines, byLine);
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
  const skipped: { code: string; reason: string }[] = [...preSkipped];
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
