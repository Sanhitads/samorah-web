import { describe, it, expect } from "vitest";
import {
  canTransitionFulfillment,
  assertFulfillmentTransition,
  isTerminalFulfillment,
  fulfillmentReadyToShip,
  fulfillmentToOrderStatus,
  nextFulfillmentStates,
} from "@/lib/fulfillment/state";

describe("fulfillment state machine (§1)", () => {
  it("walks the happy path reserved → … → shipped", () => {
    const path = ["reserved", "picking", "picked", "packing", "packed", "qc_passed", "ready_for_dispatch", "courier_assigned", "picked_up", "shipped"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionFulfillment(path[i], path[i + 1]), `${path[i]}→${path[i + 1]}`).toBe(true);
    }
  });

  it("QC failure reworks back to packing; QC pass proceeds", () => {
    expect(canTransitionFulfillment("packed", "qc_failed")).toBe(true);
    expect(canTransitionFulfillment("qc_failed", "packing")).toBe(true);
    expect(canTransitionFulfillment("packed", "qc_passed")).toBe(true);
  });

  it("forbids skipping QC (packed → ready_for_dispatch) and illegal jumps", () => {
    expect(canTransitionFulfillment("packed", "ready_for_dispatch")).toBe(false);
    expect(canTransitionFulfillment("reserved", "shipped")).toBe(false);
    expect(() => assertFulfillmentTransition("reserved", "shipped")).toThrow(/Illegal fulfillment transition/);
  });

  it("on_hold can be entered pre-QC and resumed or cancelled", () => {
    expect(canTransitionFulfillment("picking", "on_hold")).toBe(true);
    expect(canTransitionFulfillment("on_hold", "picking")).toBe(true);
    expect(canTransitionFulfillment("on_hold", "cancelled")).toBe(true);
  });

  it("§14 gate: only ready_for_dispatch onward may ship", () => {
    expect(fulfillmentReadyToShip("packed")).toBe(false);
    expect(fulfillmentReadyToShip("qc_passed")).toBe(false);
    expect(fulfillmentReadyToShip("ready_for_dispatch")).toBe(true);
    expect(fulfillmentReadyToShip("shipped")).toBe(true);
  });

  it("maps fulfillment status onto the coarse order status", () => {
    expect(fulfillmentToOrderStatus("picking")).toBe("processing");
    expect(fulfillmentToOrderStatus("qc_passed")).toBe("packed");
    expect(fulfillmentToOrderStatus("picked_up")).toBe("shipped");
    expect(fulfillmentToOrderStatus("on_hold")).toBeNull();
  });

  it("shipped and cancelled are terminal", () => {
    expect(isTerminalFulfillment("shipped")).toBe(true);
    expect(isTerminalFulfillment("cancelled")).toBe(true);
    expect(nextFulfillmentStates("shipped")).toEqual([]);
  });
});
