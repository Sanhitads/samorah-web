import { describe, it, expect } from "vitest";
import { valueForKind, entityPath, isEntityKind, type PickerKind } from "./pathPicker";

describe("type-first picker state logic (#2/#7 — no stale path across kinds)", () => {
  it("kind change clears any prior path (except Homepage → /)", () => {
    expect(valueForKind("home")).toBe("/");
    expect(valueForKind("custom")).toBe("");
    for (const k of ["page", "product", "collection", "chapter"] as PickerKind[]) expect(valueForKind(k)).toBe("");
  });

  it("every kind transition resolves to a clean value — nothing stale can be submitted", () => {
    // Simulate: pick a Product path, then switch kinds. Each switch resets before a new selection.
    const productPath = entityPath("product", "amber-oud");
    expect(productPath).toBe("/shop/amber-oud");
    // Product → Custom: cleared
    expect(valueForKind("custom")).toBe("");
    // Custom → Product: cleared (user must reselect)
    expect(valueForKind("product")).toBe("");
    // Page → Collection: cleared
    expect(valueForKind("collection")).toBe("");
    // Entity → Homepage: canonical "/"
    expect(valueForKind("home")).toBe("/");
  });

  it("entityPath reuses the canonical ENTITY_ROUTE mapping", () => {
    expect(entityPath("page", "about")).toBe("/about");
    expect(entityPath("chapter", "the-hours")).toBe("/chapters/the-hours");
    expect(entityPath("collection", "the-everyday")).toBe("/collections/the-everyday");
  });

  it("isEntityKind distinguishes entity kinds from custom/home", () => {
    expect(isEntityKind("product")).toBe(true);
    expect(isEntityKind("custom")).toBe(false);
    expect(isEntityKind("home")).toBe(false);
  });
});
