import { describe, it, expect } from "vitest";
import { filterSortInventory, presentTypes, type InvFilter } from "./inventoryList";
import type { InventoryRow } from "@/services/inventoryService";

const row = (over: Partial<InventoryRow>): InventoryRow => ({
  variantId: "v", productId: "p", productName: "Kashmiri Chai", productType: "candle", productSlug: "kashmiri-chai",
  collectionName: "The Everyday", sku: "SAM-001", variantName: "140g", vessel: "Ceramic", size: "140g",
  onHand: 10, reserved: 0, available: 10, lowStockThreshold: 5, isActive: true,
  status: "in_stock", lastMovementAt: "2026-08-01T00:00:00Z", lastMovementType: "sale", ...over,
});

const base: InvFilter = { search: "", status: "all", productType: "all", sort: "sku_asc" };

describe("inventory list logic (Phase 1A)", () => {
  const rows = [
    row({ variantId: "a", sku: "AAA", productName: "Amber", available: 2, status: "low_stock", productType: "candle", lastMovementAt: "2026-08-03T00:00:00Z" }),
    row({ variantId: "b", sku: "BBB", productName: "Basil", available: 0, status: "out_of_stock", productType: "room_spray", lastMovementAt: "2026-08-05T00:00:00Z" }),
    row({ variantId: "c", sku: "CCC", productName: "Cedar", available: 20, status: "in_stock", productType: "candle", lastMovementAt: "2026-08-01T00:00:00Z" }),
  ];

  it("filters by status and product type", () => {
    expect(filterSortInventory(rows, { ...base, status: "out_of_stock" }).map((r) => r.sku)).toEqual(["BBB"]);
    expect(filterSortInventory(rows, { ...base, productType: "candle" }).map((r) => r.sku)).toEqual(["AAA", "CCC"]);
  });

  it("search matches name / sku / variant / collection", () => {
    expect(filterSortInventory(rows, { ...base, search: "cedar" }).map((r) => r.sku)).toEqual(["CCC"]);
    expect(filterSortInventory(rows, { ...base, search: "bbb" }).map((r) => r.sku)).toEqual(["BBB"]);
  });

  it("sorts by lowest/highest available and most recent", () => {
    expect(filterSortInventory(rows, { ...base, sort: "stock_asc" }).map((r) => r.available)).toEqual([0, 2, 20]);
    expect(filterSortInventory(rows, { ...base, sort: "stock_desc" }).map((r) => r.available)).toEqual([20, 2, 0]);
    expect(filterSortInventory(rows, { ...base, sort: "recent" }).map((r) => r.sku)).toEqual(["BBB", "AAA", "CCC"]);
  });

  it("presentTypes returns distinct sorted types", () => {
    expect(presentTypes(rows)).toEqual(["candle", "room_spray"]);
  });
});
