import { describe, it, expect } from "vitest";
import { hasCapability, capabilitiesFor, CAPABILITIES } from "@/lib/auth/capabilities";

describe("capability-based authorization", () => {
  it("warehouse (editor) can operate/triage fulfillment + operate returns, but not cancel/refund", () => {
    expect(hasCapability("editor", "fulfillment.operate")).toBe(true);
    expect(hasCapability("editor", "fulfillment.triage")).toBe(true);
    expect(hasCapability("editor", "returns.operate")).toBe(true);
    expect(hasCapability("editor", "order.cancel")).toBe(false);
    expect(hasCapability("editor", "order.refund")).toBe(false);
  });

  it("manager (CS/Finance) adds cancel/refund/returns.approve/analytics/export", () => {
    expect(hasCapability("manager", "order.cancel")).toBe(true);
    expect(hasCapability("manager", "order.refund")).toBe(true);
    expect(hasCapability("manager", "returns.approve")).toBe(true);
    expect(hasCapability("manager", "analytics.view")).toBe(true);
    expect(hasCapability("manager", "catalog.manage")).toBe(false); // admin territory
  });

  it("admin adds catalog/rules/shipping/users; super_admin holds everything", () => {
    expect(hasCapability("admin", "catalog.manage")).toBe(true);
    expect(hasCapability("admin", "users.manage")).toBe(true);
    expect(capabilitiesFor("super_admin").length).toBe(CAPABILITIES.length);
  });

  it("customer and unknown roles hold nothing", () => {
    expect(hasCapability("customer", "fulfillment.operate")).toBe(false);
    expect(hasCapability(null, "order.cancel")).toBe(false);
    expect(hasCapability("nonsense", "order.refund")).toBe(false);
  });

  it("roles inherit lower bundles (manager ⊇ editor)", () => {
    for (const cap of capabilitiesFor("editor")) expect(hasCapability("manager", cap)).toBe(true);
  });

  it("manufacturing: editor operates+QCs, manager releases, admin recalls — with separation of duties", () => {
    // editor (production floor): create/edit batches + record QC, but may NOT release or recall.
    expect(hasCapability("editor", "manufacturing.operate")).toBe(true);
    expect(hasCapability("editor", "manufacturing.qc")).toBe(true);
    expect(hasCapability("editor", "manufacturing.release")).toBe(false);
    expect(hasCapability("editor", "manufacturing.recall")).toBe(false);
    // manager adds release (a DIFFERENT role from the editor who records QC → separation of duties).
    expect(hasCapability("manager", "manufacturing.release")).toBe(true);
    expect(hasCapability("manager", "manufacturing.recall")).toBe(false);
    // recall (production-critical) is admin+; super_admin inherits everything.
    expect(hasCapability("admin", "manufacturing.recall")).toBe(true);
    expect(hasCapability("super_admin", "manufacturing.recall")).toBe(true);
    // customers never hold any manufacturing capability.
    expect(hasCapability("customer", "manufacturing.operate")).toBe(false);
  });
});
