import { describe, it, expect } from "vitest";
import {
  canTransitionShipment,
  assertShipmentTransition,
  isTerminalShipment,
  nextShipmentStates,
  toCustomerStatus,
} from "@/lib/shipment/state";

describe("shipment state machine", () => {
  it("follows the fulfilment path pending → … → delivered", () => {
    const path = [
      "pending", "ready_to_ship", "shipment_created", "courier_assigned", "label_generated",
      "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionShipment(path[i], path[i + 1]), `${path[i]}→${path[i + 1]}`).toBe(true);
    }
  });

  it("forbids illegal jumps and post-terminal moves", () => {
    expect(canTransitionShipment("pending", "delivered")).toBe(false);
    expect(canTransitionShipment("delivered", "in_transit")).toBe(false);
    expect(() => assertShipmentTransition("pending", "in_transit")).toThrow(/Illegal shipment transition/);
  });

  it("allows cancel pre-pickup but not after pickup", () => {
    expect(canTransitionShipment("label_generated", "cancelled")).toBe(true);
    expect(canTransitionShipment("picked_up", "cancelled")).toBe(false);
  });

  it("supports exceptions and RTO from transit", () => {
    expect(canTransitionShipment("in_transit", "exception")).toBe(true);
    expect(canTransitionShipment("out_for_delivery", "rto")).toBe(true);
    expect(canTransitionShipment("exception", "delivered")).toBe(true);
  });

  it("treats delivered / rto / cancelled as terminal", () => {
    for (const s of ["delivered", "rto", "cancelled"] as const) {
      expect(isTerminalShipment(s)).toBe(true);
      expect(nextShipmentStates(s)).toEqual([]);
    }
  });

  it("maps internal states to the unified customer status", () => {
    expect(toCustomerStatus("label_generated")).toBe("preparing");
    expect(toCustomerStatus("picked_up")).toBe("shipped");
    expect(toCustomerStatus("out_for_delivery")).toBe("out_for_delivery");
    expect(toCustomerStatus("delivered")).toBe("delivered");
    expect(toCustomerStatus("rto")).toBe("returned");
  });
});
