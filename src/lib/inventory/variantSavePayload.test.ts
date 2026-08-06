import { describe, it, expect } from "vitest";
import { buildVariantSavePayload } from "./variantSavePayload";

describe("variant save payload — stock authority (Phase 1A §1)", () => {
  it("a NEW variant carries initial stock (opening balance)", () => {
    const p = buildVariantSavePayload({ sku: "X-1", price: 100, stock: 7 }, "prod1");
    expect(p).toMatchObject({ productId: "prod1", sku: "X-1", stock: 7 });
  });

  it("a NEW variant with initial stock = 0 still carries stock (deterministic anchor)", () => {
    const p = buildVariantSavePayload({ sku: "X-0", price: 100, stock: 0 }, "prod1");
    expect(p.stock).toBe(0);
  });

  it("an EXISTING variant edit submits NO stock at all", () => {
    const p = buildVariantSavePayload({ id: "var1", sku: "X-1", price: 100, stock: 999 }, "prod1");
    expect("stock" in p).toBe(false); // never resubmitted
    expect(p).toMatchObject({ id: "var1", productId: "prod1", sku: "X-1" });
  });
});
