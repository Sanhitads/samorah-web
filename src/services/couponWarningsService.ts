/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon operational warnings (Phase 3 · point 25) — server-side fact resolution.
 *
 * Reuses the CANONICAL promotion engine (no parallel logic):
 *  • "no eligible products" / target overlap → couponEligibleLines() against the live catalogue
 *  • "auto-apply conflict" → canCombine() over the same Coupon objects checkout builds
 *  • "invalid configuration" → validateCouponForActivation()
 *  • status/expiry/exhaustion → couponStatus()
 * The pure formatter (buildCouponWarnings) turns the resolved facts into severity-ranked messages.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { couponEligibleLines, canCombine, type Coupon, type PromoLine, type CouponTarget } from "@/lib/promotions";
import { couponStatus } from "@/lib/couponStatus";
import { validateCouponForActivation } from "@/lib/couponValidation";
import { buildCouponWarnings, type CouponWarning } from "@/lib/couponWarnings";
import type { AdminCoupon, AdminCouponTarget } from "@/services/couponAdminService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

const engineType = (t: AdminCoupon["type"]) => (t === "percent" ? "percentage" : t);
const toTargets = (ts: AdminCouponTarget[], mode: "include" | "exclude"): CouponTarget[] =>
  ts.filter((t) => t.mode === mode).map((t) => ({ type: t.type, id: t.id ?? undefined, value: t.value ?? undefined }));

/** AdminCoupon → the engine's Coupon (targeting + stacking subset) — mirrors loadCouponRegistry. */
function toPromoCoupon(c: AdminCoupon): Coupon {
  return {
    code: c.code,
    label: c.publicDescription || c.code,
    campaign: c.autoApply ? "auto" : "coupon",
    version: "v1",
    priority: c.priority,
    stackable: true,
    exclusive: false,
    combinableWith: c.combinable ? ["*"] : ["FREE_SHIPPING"],
    type: engineType(c.type),
    value: c.value,
    maxDiscount: c.maxDiscount ?? undefined,
    active: c.status === "active",
    autoApply: c.autoApply,
    excludeSale: c.excludeSale,
    includes: toTargets(c.targets, "include"),
    excludes: toTargets(c.targets, "exclude"),
  };
}

/** The live sellable catalogue as engine lines (one per active variant) + active id sets. */
async function loadCatalog() {
  const db = loose();
  const { data: products } = await db
    .from("products")
    .select("id, category_id, collection_id, product_type, sale_price, status, variants(id, is_active)")
    .eq("status", "active");
  const lines: PromoLine[] = [];
  const activeProducts = new Set<string>();
  const activeCategories = new Set<string>();
  const activeCollections = new Set<string>();
  const activeVariants = new Set<string>();
  const activeTypes = new Set<string>();
  for (const p of products ?? []) {
    activeProducts.add(p.id);
    if (p.category_id) activeCategories.add(p.category_id);
    if (p.collection_id) activeCollections.add(p.collection_id);
    if (p.product_type) activeTypes.add(p.product_type);
    const variants = (p.variants ?? []).filter((v: any) => v.is_active);
    for (const v of variants) {
      activeVariants.add(v.id);
      lines.push({
        key: `${p.id}:${v.id}`,
        unitPrice: 1, // eligibility only cares about identity, not price
        qty: 1,
        productId: p.id,
        categoryId: p.category_id ?? undefined,
        collectionId: p.collection_id ?? undefined,
        productType: p.product_type ?? undefined,
        variantId: v.id,
        onSale: p.sale_price != null,
        isGiftCard: p.product_type === "gift_card",
      });
    }
  }
  return { lines, activeProducts, activeCategories, activeCollections, activeVariants, activeTypes };
}

/** Include-targets that reference an archived / removed catalogue entity. */
function archivedTargets(c: AdminCoupon, cat: Awaited<ReturnType<typeof loadCatalog>>): string[] {
  const labels: string[] = [];
  for (const t of c.targets.filter((x) => x.mode === "include")) {
    const missing =
      (t.type === "product" && t.id && !cat.activeProducts.has(t.id)) ||
      (t.type === "category" && t.id && !cat.activeCategories.has(t.id)) ||
      (t.type === "collection" && t.id && !cat.activeCollections.has(t.id)) ||
      (t.type === "variant" && t.id && !cat.activeVariants.has(t.id)) ||
      (t.type === "product_type" && t.value && !cat.activeTypes.has(t.value));
    if (missing) labels.push(t.value || `${t.type}`);
  }
  return labels;
}

/** Facts config for validateCouponForActivation (mirrors couponAdminService.rowToConfig). */
function toValidationConfig(c: AdminCoupon) {
  return {
    code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrder: c.minOrder,
    maxUses: c.maxUses, maxUsesPerUser: c.maxUsesPerUser, minQualifyingQuantity: c.minQualifyingQuantity,
    startsAt: c.startsAt, expiresAt: c.expiresAt,
    includes: toTargets(c.targets, "include"), excludes: toTargets(c.targets, "exclude"),
  };
}

/**
 * Resolve severity-ranked warnings for every coupon. `nowMs` is injectable for determinism/tests.
 * Returns couponId → warnings (only coupons with something actionable appear).
 */
export async function getCouponWarnings(coupons: AdminCoupon[], nowMs = Date.now()): Promise<Map<string, CouponWarning[]>> {
  const cat = await loadCatalog();
  const now = new Date(nowMs);

  // Pre-compute each coupon's engine form + eligible line-keys + derived status (single pass).
  const rows = coupons.map((c) => {
    const promo = toPromoCoupon(c);
    const eligible = couponEligibleLines(cat.lines, promo);
    const status = couponStatus({ status: c.status, startsAt: c.startsAt, expiresAt: c.expiresAt, maxUses: c.maxUses, usedCount: c.usedCount }, now).status;
    return { c, promo, eligibleKeys: new Set(eligible.map((l) => l.key)), eligibleCount: eligible.length, status };
  });

  // Live auto-apply coupons that can't stack AND share eligible lines → mutual conflict.
  const liveAuto = rows.filter((r) => r.status === "active" && r.c.autoApply);
  const conflicts = new Map<string, Set<string>>();
  for (let i = 0; i < liveAuto.length; i++) {
    for (let j = i + 1; j < liveAuto.length; j++) {
      const a = liveAuto[i], b = liveAuto[j];
      const stack = canCombine(a.promo, a.promo.type, b.promo, b.promo.type);
      if (stack) continue;
      const overlap = [...a.eligibleKeys].some((k) => b.eligibleKeys.has(k));
      if (!overlap) continue;
      (conflicts.get(a.c.id) ?? conflicts.set(a.c.id, new Set()).get(a.c.id)!).add(b.c.code);
      (conflicts.get(b.c.id) ?? conflicts.set(b.c.id, new Set()).get(b.c.id)!).add(a.c.code);
    }
  }

  const out = new Map<string, CouponWarning[]>();
  for (const r of rows) {
    const warnings = buildCouponWarnings({
      effectiveStatus: r.status,
      autoApply: r.c.autoApply,
      expiresAt: r.c.expiresAt,
      usedCount: r.c.usedCount,
      maxUses: r.c.maxUses,
      invalidReason: r.status === "active" ? (validateCouponForActivation(toValidationConfig(r.c))[0] ?? null) : null,
      eligibleProductCount: r.eligibleCount,
      archivedTargetLabels: archivedTargets(r.c, cat),
      conflictsWith: [...(conflicts.get(r.c.id) ?? [])],
      hasIncludes: r.c.targets.some((t) => t.mode === "include"),
      nowMs,
    });
    if (warnings.length) out.set(r.c.id, warnings);
  }
  return out;
}
