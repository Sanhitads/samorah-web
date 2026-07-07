import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminalStatus, nextStates } from "@/lib/orderState";

describe("order state machine — allowed transitions only", () => {
  it("permits the happy path pending → confirmed → packed → shipped → delivered", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "packed")).toBe(true);
    expect(canTransition("packed", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("forbids illegal jumps", () => {
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("delivered", "pending")).toBe(false);
    expect(() => assertTransition("pending", "delivered")).toThrow(/Illegal order transition/);
  });

  it("treats cancelled / returned / rto as terminal", () => {
    for (const s of ["cancelled", "returned", "rto"] as const) {
      expect(isTerminalStatus(s)).toBe(true);
      expect(nextStates(s)).toEqual([]);
    }
  });

  it("allows cancellation up to (and including) packed, but not after shipping", () => {
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("packed", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(false);
  });

  it("shipped may only progress to delivered or rto", () => {
    expect(nextStates("shipped").sort()).toEqual(["delivered", "rto"]);
  });
});
