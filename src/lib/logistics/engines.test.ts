import { describe, it, expect } from "vitest";
import { isLowStock, needsReorder, reorderQty, assetsNeedingReorder } from "@/lib/packaging/inventory";
import { recommendPackaging } from "@/lib/packaging/recommend";
import { EXAMPLE_PACKAGING_CATALOG as CAT } from "@/config/packaging";
import { channelsFor, isChannelImplemented, DEFAULT_NOTIFICATION_TRIGGERS } from "@/lib/notifications/triggers";
import { mapSettingsRow, DEFAULT_SHIPPING_SETTINGS } from "@/lib/settings/shippingSettings";
import { mapWarehouseRow } from "@/services/warehouseService";
import type { PackagingAsset } from "@/lib/packaging/types";

describe("packaging inventory (§3)", () => {
  const asset = (o: Partial<PackagingAsset>): PackagingAsset => ({ id: "a", name: "a", type: "wrap", weightG: 10, active: true, ...o });
  it("flags low + reorder correctly", () => {
    expect(isLowStock(asset({ currentStock: 3, minStock: 5 }))).toBe(true);
    expect(isLowStock(asset({ currentStock: 8, minStock: 5 }))).toBe(false);
    expect(needsReorder(asset({ currentStock: 2, reorderLevel: 10 }))).toBe(true);
    expect(reorderQty(asset({ currentStock: 2 }), 50)).toBe(48);
  });
  it("lists assets needing reorder, most urgent first", () => {
    const list = assetsNeedingReorder([
      asset({ id: "x", currentStock: 5, reorderLevel: 10 }),
      asset({ id: "y", currentStock: 1, reorderLevel: 10 }),
      asset({ id: "z", currentStock: 99, reorderLevel: 10 }),
    ]);
    expect(list.map((a) => a.id)).toEqual(["y", "x"]);
  });
});

describe("packaging recommendation → confirm (§6)", () => {
  it("recommends a parcel and requires human confirmation", () => {
    const rec = recommendPackaging({ productCount: 1, productTypes: ["candle"], vessels: ["glass"], isGift: false, netWeightsG: [300] }, CAT);
    expect(rec?.parcel.profileName).toBe("Single Candle");
    expect(rec?.requiresConfirmation).toBe(true);
  });
});

describe("notification triggers (§10)", () => {
  it("resolves channels for an event", () => {
    expect(channelsFor(DEFAULT_NOTIFICATION_TRIGGERS, "order.confirmed")).toEqual([{ channel: "email", template: "ORDER_CONFIRMATION" }]);
    expect(channelsFor(DEFAULT_NOTIFICATION_TRIGGERS, "order.unknown")).toEqual([]);
  });
  it("knows which channels are implemented today", () => {
    expect(isChannelImplemented("email")).toBe(true);
    expect(isChannelImplemented("whatsapp")).toBe(false);
  });
});

describe("shipping settings (§11)", () => {
  it("null row → code defaults", () => {
    expect(mapSettingsRow(null)).toEqual(DEFAULT_SHIPPING_SETTINGS);
  });
  it("maps DB columns and coerces numbers", () => {
    const s = mapSettingsRow({ default_provider: "shiprocket", courier_strategy: "cheapest", auto_assign: false, insurance_threshold: "2000", volumetric_divisor: 4000 });
    expect(s.defaultProvider).toBe("shiprocket");
    expect(s.courierStrategy).toBe("cheapest");
    expect(s.autoAssign).toBe(false);
    expect(s.insuranceThreshold).toBe(2000);
    expect(s.volumetricDivisor).toBe(4000);
    // unset fields fall back to defaults
    expect(s.codThreshold).toBe(DEFAULT_SHIPPING_SETTINGS.codThreshold);
  });
});

describe("warehouse mapper (§2)", () => {
  it("maps a DB row to a PickupLocation-compatible warehouse", () => {
    const w = mapWarehouseRow({ id: "wh_del", name: "Delhi", line1: "1 St", city: "Delhi", state: "Delhi", pincode: "110001", gstin: "07XXX", priority: 2, active: true, phone: "9000000000" });
    expect(w.id).toBe("wh_del");
    expect(w.priority).toBe(2);
    expect(w.address.city).toBe("Delhi");
    expect(w.address.pincode).toBe("110001");
  });
});
