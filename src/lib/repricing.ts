/**
 * Server-side cart re-pricing + validation (Stage 2A). NEVER trust the client
 * cart: prices are re-derived from the catalogue (DB candles + config Air), the
 * composition is re-validated (exactly 3, same vessel, 100g eligible), and totals
 * are recomputed with the SAME engine (`computeOrderTotals`). The Razorpay amount
 * is ALWAYS the server `payable` — never a client-supplied number.
 */
import { getProductBySlug } from "@/services/productService";
import { getHourBySlug, airProductType } from "@/config/theHours";
import { effectivePrice } from "@/lib/pricing";
import { computeOrderTotals, type CommerceLine, type OrderTotals } from "@/lib/commerce";
import { loadCouponRegistry } from "@/services/couponService";
import { BUNDLE_SIZE } from "@/lib/bundle";
import { COMMERCE } from "@/config/commerce";

/** A cart line as the client sends it (authoritative fields are re-derived). */
export interface ClientCartLine {
  key: string;
  slug: string;
  name: string;
  vessel: string;
  size: string;
  qty: number;
  compositionId?: string;
  productType?: string;
  edition?: string; // presentation label only (non-financial), snapshotted for the invoice
}

/** Per-line persistence detail (keyed by line key) — the immutable invoice-snapshot
 *  fields that aren't part of the tax engine's input. */
export interface LineDetail {
  sku: string;
  productId?: string;
  variantId?: string;
  variantName?: string;
  brandName?: string;
  collectionName?: string;
  volumeLabel?: string;
  editionLabel?: string;
  vessel?: string;
  size?: string;
  productSlug?: string;
  imageUrl?: string;
}

export interface RepriceResult {
  valid: boolean;
  reason?: string;
  lines: CommerceLine[];
  details: Record<string, LineDetail>;
  totals: OrderTotals | null;
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Re-price + validate a client cart against the catalogue for `state`.
 *  `couponCode` (if any) flows into the SAME engine, so the server payable stays
 *  identical to what Checkout showed. */
export async function repriceCart(items: ClientCartLine[], state?: string, couponCode?: string): Promise<RepriceResult> {
  const fail = (reason: string): RepriceResult => ({ valid: false, reason, lines: [], details: {}, totals: null });
  if (!items?.length) return fail("Your bag is empty.");

  const lines: CommerceLine[] = [];
  const details: Record<string, LineDetail> = {};

  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.qty || 1));

    // Air product (config) — single price, no vessel, synthetic SKU.
    const air = getHourBySlug(item.slug);
    if (air) {
      lines.push({
        key: item.key,
        name: air.hour.name,
        unitPrice: air.hour.price,
        qty,
        taxClass: airProductType(air.group.kind),
        compositionId: item.compositionId,
      });
      details[item.key] = {
        sku: `AIR-${item.slug.toUpperCase()}`,
        variantName: item.productType,
        brandName: COMMERCE.brandName,
        collectionName: air.volume.title,
        editionLabel: item.edition,
        productSlug: item.slug,
      };
      continue;
    }

    // Candle (DB) — price from the matched active variant (vessel × size).
    const product = (await getProductBySlug(item.slug)) as
      | {
          id?: string;
          name: string;
          slug?: string;
          status?: string;
          price?: number | null;
          collection?: { name?: string | null; volume?: string | null } | null;
          product_images?: { url: string; is_primary: boolean }[] | null;
          variants?: { id?: string; sku?: string | null; vessel_type: string | null; size_label: string | null; price: number; sale_price: number | null; is_active: boolean }[];
        }
      | null;
    if (!product) return fail("A product in your bag is no longer available.");
    // Publish lock — never take payment for an archived / unpublished product.
    if (product.status && product.status !== "active") {
      return fail("One or more items in your collection are no longer available. Please review your bag.");
    }

    const variant = (product.variants ?? []).find(
      (v) => v.is_active && norm(v.vessel_type ?? "") === norm(item.vessel) && v.size_label === item.size,
    );
    const priceable = variant ?? (product.price != null ? { price: product.price, sale_price: null } : null);
    if (!priceable) return fail("A product in your bag is no longer available in that option.");

    const image = (product.product_images ?? []).find((im) => im.is_primary) ?? (product.product_images ?? [])[0];
    lines.push({
      key: item.key,
      name: product.name,
      unitPrice: effectivePrice(priceable),
      qty,
      taxClass: "candle",
      compositionId: item.compositionId,
    });
    details[item.key] = {
      sku: variant?.sku ?? `${item.slug}-${norm(item.vessel)}-${item.size}`.toUpperCase(),
      productId: product.id,
      variantId: variant?.id,
      variantName: [item.vessel, item.size].filter(Boolean).join(" · ") || undefined,
      brandName: COMMERCE.brandName,
      collectionName: product.collection?.name ?? undefined,
      volumeLabel: product.collection?.volume ?? undefined,
      editionLabel: item.edition,
      vessel: item.vessel,
      size: item.size,
      productSlug: product.slug ?? item.slug,
      imageUrl: image?.url,
    };
  }

  // Composition integrity: each group must be exactly BUNDLE_SIZE, all 100g, one vessel.
  const groups = new Map<string, ClientCartLine[]>();
  for (const item of items) {
    if (!item.compositionId) continue;
    const g = groups.get(item.compositionId) ?? [];
    g.push(item);
    groups.set(item.compositionId, g);
  }
  for (const g of groups.values()) {
    const vessels = new Set(g.map((i) => norm(i.vessel)));
    const all100g = g.every((i) => i.size === "100g");
    if (g.length !== BUNDLE_SIZE || vessels.size !== 1 || !all100g) {
      return fail("Your Discovery Composition is no longer valid — please review your bag.");
    }
  }

  // DB-driven coupon registry (active · in-window · under-limit). A code only
  // discounts if it resolves here — never a hardcoded array.
  const couponRegistry = couponCode ? await loadCouponRegistry() : undefined;
  const totals = computeOrderTotals(lines, { state, couponCode, couponRegistry });
  return { valid: true, lines, details, totals };
}
