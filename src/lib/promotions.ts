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
  autoApply?: boolean; // applies with no code (Phase 1 · point 6) — best eligible one is auto-selected
  eligibility?: "everyone" | "first_order"; // Phase 2 · point 14 — customer eligibility
  minQualifyingQuantity?: number; // Phase 2 · point 15 — min ELIGIBLE units (post targeting/exclusions)
  // Targeting (Phase 1 · points 2/3). Empty/undefined `includes` = ENTIRE eligible order (unchanged
  // behaviour). Explicit `excludes` ALWAYS win over includes. `excludeSale` drops sale-priced lines.
  // Gift cards and bundle/composition lines are excluded INTRINSICALLY by the engine (no config needed).
  includes?: CouponTarget[];
  excludes?: CouponTarget[];
  excludeSale?: boolean;
}

/** Context the pricing caller injects so the pure engine can evaluate customer eligibility (Phase 2 #14)
 *  without doing any I/O. `firstOrder` undefined = identity unknown yet (allow now, re-check at reserve). */
export interface PromoContext { firstOrder?: boolean }

const couponMeetsMin = (c: Coupon, subtotalPaise: number) => !c.minSubtotal || subtotalPaise >= toPaise(c.minSubtotal);

/** The discount a coupon would apply to its eligible lines, net of any already-allocated discount (paise).
 *  Free-shipping coupons return 0 here — their benefit is the waived shipping, handled downstream. */
function couponDiscountPaise(c: Coupon, eligible: PromoLine[], byLine: Record<string, number>): number {
  if (c.type === "free_shipping") return 0;
  const base = eligible.reduce((s, l) => s + linePaise(l) - (byLine[l.key] ?? 0), 0);
  let amt = c.type === "percentage" ? Math.round((base * c.value) / 100) : Math.min(toPaise(c.value), base);
  if (c.type === "percentage" && c.maxDiscount) amt = Math.min(amt, toPaise(c.maxDiscount));
  return Math.max(0, amt);
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
export function computePromotions(lines: PromoLine[], couponCode?: string, coupons: Coupon[] = COUPONS, ctx: PromoContext = {}): PromotionResult {
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

  // ── Coupon candidates: the manually-entered code (precedence) + eligible AUTO-APPLY coupons ──────
  // Min-order gates on the WHOLE cart subtotal (an order minimum), not the targeted subset.
  const subtotal = lines.reduce((s, l) => s + linePaise(l), 0);
  interface Spec { coupon: Coupon; eligible: PromoLine[]; benefit: number }
  // Resolve a coupon to a usable spec, or a skip-reason (so the UI can explain rather than say "unknown").
  const specOf = (c: Coupon): Spec | { skip: string } => {
    // Customer eligibility (point 14). Only rejects when we KNOW the customer isn't first-order; unknown
    // identity is allowed here and re-validated atomically at reservation.
    if (c.eligibility === "first_order" && ctx.firstOrder === false) return { skip: "only valid on your first order" };
    if (!couponMeetsMin(c, subtotal)) return { skip: `minimum order of ₹${(c.minSubtotal ?? 0).toLocaleString("en-IN")} not met` };
    const eligible = couponEligibleLines(lines, c); // targeting/exclusions (points 2/3)
    if (c.type !== "free_shipping" && eligible.length === 0) return { skip: "no items in your bag qualify for this code" };
    // Minimum qualifying quantity (point 15) — ELIGIBLE units after targeting/exclusions (not SKUs, not
    // cart total; bundle lines are already excluded by couponEligibleLines, per the Phase-1 bundle policy).
    if (c.minQualifyingQuantity && c.minQualifyingQuantity > 1) {
      const units = eligible.reduce((s, l) => s + l.qty, 0);
      if (units < c.minQualifyingQuantity) return { skip: `add ${c.minQualifyingQuantity - units} more qualifying item${c.minQualifyingQuantity - units === 1 ? "" : "s"}` };
    }
    return { coupon: c, eligible, benefit: couponDiscountPaise(c, eligible, {}) };
  };
  const chosen: Spec[] = [];

  // Manual code — precedence. A specific skip reason is surfaced when it can't apply.
  const manual = couponCode ? coupons.find((c) => c.active && c.code === couponCode.toUpperCase()) : undefined;
  if (manual) {
    const s = specOf(manual);
    if ("skip" in s) preSkipped.push({ code: manual.code, reason: s.skip });
    else chosen.push(s);
  }
  const manualDiscountHeld = !!manual && manual.type !== "free_shipping" && chosen.some((s) => s.coupon.code === manual.code);

  // Auto-apply coupons (point 6). Deterministic selection through the authoritative engine:
  //   • free-shipping auto-applies never conflict → all eligible ones stack;
  //   • among discount auto-applies, pick the GREATEST customer benefit, then lowest priority, then code
  //     (never DB/array order). Skipped entirely when a manual DISCOUNT coupon already holds precedence.
  const autoSpecs = coupons
    .filter((c) => c.active && c.autoApply && (!manual || c.code !== manual.code))
    .map(specOf)
    .filter((s): s is Spec => !("skip" in s));
  for (const s of autoSpecs) if (s.coupon.type === "free_shipping") chosen.push(s);
  if (!manualDiscountHeld) {
    const best = autoSpecs
      .filter((s) => s.coupon.type !== "free_shipping" && s.benefit > 0)
      .sort((a, b) => b.benefit - a.benefit || a.coupon.priority - b.coupon.priority || (a.coupon.code < b.coupon.code ? -1 : 1))[0];
    if (best) chosen.push(best);
  }

  for (const s of chosen) {
    const c = s.coupon;
    candidates.push({
      meta: c,
      rule: { kind: c.type, value: c.type === "free_shipping" ? undefined : c.value },
      apply: (byLine) => {
        if (c.type === "free_shipping") return { amount: 0, freeShipping: true };
        const amt = couponDiscountPaise(c, s.eligible, byLine); // eligible lines only → excluded get ₹0 (point 11)
        if (amt > 0) allocatePro(amt, s.eligible, byLine);
        return { amount: amt };
      },
    });
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
