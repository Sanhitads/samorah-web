import type { VariantInput } from "@/services/productAdminService";

/**
 * Build the Product-Editor `variant.upsert` payload (Phase 1A authority switch).
 * Stock is ledger-owned: only a NEW variant may carry an initial stock (the AFTER INSERT trigger
 * anchors its opening balance atomically). An EXISTING variant edit NEVER submits stock — on-hand
 * changes go exclusively through /admin/inventory → adjust_inventory. This closes the payload-level
 * contradiction; the DB also revokes UPDATE(stock) as the hard backstop.
 */
export type VariantDraft = {
  id?: string; sku: string; variantName?: string | null; vesselType?: VariantInput["vesselType"]; sizeLabel?: string | null;
  price: number; salePrice?: number | null; costPrice?: number; stock?: number; isActive?: boolean; sortOrder?: number;
  barcode?: string | null; weightGrams?: number | null; lowStockThreshold?: number | null; shippingClass?: string | null;
  packageLengthCm?: number | null; packageWidthCm?: number | null; packageHeightCm?: number | null; supplierSku?: string | null;
};

export function buildVariantSavePayload(draft: VariantDraft, productId: string): Record<string, unknown> {
  const { stock, id, ...rest } = draft;
  const payload: Record<string, unknown> = { ...rest, id: id || undefined, productId };
  if (!id) payload.stock = stock ?? 0; // create only — initial opening balance (trigger anchors it)
  return payload;
}
