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
import { BUNDLE_SIZE } from "@/lib/bundle";

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
}

export interface RepriceResult {
  valid: boolean;
  reason?: string;
  lines: CommerceLine[];
  totals: OrderTotals | null;
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Re-price + validate a client cart against the catalogue for `state`.
 *  `couponCode` (if any) flows into the SAME engine, so the server payable stays
 *  identical to what Checkout showed. */
export async function repriceCart(items: ClientCartLine[], state?: string, couponCode?: string): Promise<RepriceResult> {
  if (!items?.length) return { valid: false, reason: "Your bag is empty.", lines: [], totals: null };

  const lines: CommerceLine[] = [];

  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.qty || 1));

    // Air product (config) — single price, no vessel.
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
      continue;
    }

    // Candle (DB) — price from the matched active variant (vessel × size).
    const product = (await getProductBySlug(item.slug)) as
      | { name: string; price?: number | null; variants?: { vessel_type: string | null; size_label: string | null; price: number; sale_price: number | null; is_active: boolean }[] }
      | null;
    if (!product) return { valid: false, reason: `A product in your bag is no longer available.`, lines: [], totals: null };

    const variant = (product.variants ?? []).find(
      (v) => v.is_active && norm(v.vessel_type ?? "") === norm(item.vessel) && v.size_label === item.size,
    );
    const priceable = variant ?? (product.price != null ? { price: product.price, sale_price: null } : null);
    if (!priceable) return { valid: false, reason: `A product in your bag is no longer available in that option.`, lines: [], totals: null };

    lines.push({
      key: item.key,
      name: product.name,
      unitPrice: effectivePrice(priceable),
      qty,
      taxClass: "candle",
      compositionId: item.compositionId,
    });
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
      return { valid: false, reason: "Your Discovery Composition is no longer valid — please review your bag.", lines: [], totals: null };
    }
  }

  const totals = computeOrderTotals(lines, { state, couponCode });
  return { valid: true, lines, totals };
}
