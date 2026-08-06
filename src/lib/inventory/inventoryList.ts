/**
 * Pure list logic for /admin/inventory — search / filter / sort over rows ALREADY loaded from the
 * canonical service. Client-side over the in-memory page (the server did the 3 bounded queries), so
 * there is never a per-row reservation/history query here. Testable without a DOM.
 */
import type { InventoryRow } from "@/services/inventoryService";
import type { StockStatus } from "@/lib/inventory/adjustLogic";

export type InvSort = "stock_asc" | "stock_desc" | "name_asc" | "sku_asc" | "recent";
export type InvStatusFilter = "all" | StockStatus;
export interface InvFilter { search: string; status: InvStatusFilter; productType: string; sort: InvSort }

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock",
};

export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  candle: "Candle", room_spray: "Room freshener", linen_spray: "Linen freshener",
  wax_tablet: "Wax tablet", reed_diffuser: "Reed diffuser", other: "Other",
};

const haystack = (r: InventoryRow) =>
  `${r.productName} ${r.sku} ${r.variantName ?? ""} ${r.vessel ?? ""} ${r.size ?? ""} ${r.collectionName ?? ""}`.toLowerCase();

const COMPARATORS: Record<InvSort, (a: InventoryRow, b: InventoryRow) => number> = {
  stock_asc: (a, b) => a.available - b.available || a.onHand - b.onHand || a.sku.localeCompare(b.sku),
  stock_desc: (a, b) => b.available - a.available || b.onHand - a.onHand || a.sku.localeCompare(b.sku),
  name_asc: (a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku),
  sku_asc: (a, b) => a.sku.localeCompare(b.sku),
  recent: (a, b) => (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? ""),
};

export function filterSortInventory(rows: InventoryRow[], f: InvFilter): InventoryRow[] {
  const q = f.search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.productType !== "all" && r.productType !== f.productType) return false;
    if (q && !haystack(r).includes(q)) return false;
    return true;
  });
  return filtered.sort(COMPARATORS[f.sort]);
}

/** Distinct product types present, for the filter dropdown. */
export function presentTypes(rows: InventoryRow[]): string[] {
  return [...new Set(rows.map((r) => r.productType))].sort();
}
