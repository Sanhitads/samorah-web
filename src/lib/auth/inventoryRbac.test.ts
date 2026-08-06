import { describe, it, expect } from "vitest";
import { hasCapability } from "./capabilities";

/**
 * Phase 1A req #10 — the authorization mapping the API route enforces via requireCapability().
 * The route calls requireCapability("inventory.view") for reads and requireCapability("inventory.adjust")
 * for the adjust action, so a manager may read stock/history but every adjust attempt is refused at the
 * server (not merely hidden). (The RPC-level block — anon cannot execute adjust_inventory — is proven in
 * inventoryLedger.integration.test.ts.)
 */
describe("Inventory RBAC mapping", () => {
  it("inventory.view = manager+, inventory.adjust = admin+", () => {
    expect(hasCapability("customer", "inventory.view")).toBe(false);
    expect(hasCapability("editor", "inventory.view")).toBe(false);
    expect(hasCapability("manager", "inventory.view")).toBe(true);
    expect(hasCapability("admin", "inventory.view")).toBe(true);
    expect(hasCapability("super_admin", "inventory.view")).toBe(true);

    expect(hasCapability("editor", "inventory.adjust")).toBe(false);
    expect(hasCapability("manager", "inventory.adjust")).toBe(false); // reads yes, mutate NO
    expect(hasCapability("admin", "inventory.adjust")).toBe(true);
    expect(hasCapability("super_admin", "inventory.adjust")).toBe(true);
  });
});
