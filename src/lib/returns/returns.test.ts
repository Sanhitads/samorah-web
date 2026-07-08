import { describe, it, expect } from "vitest";
import { canTransitionReturn, assertReturnTransition, isTerminalReturn } from "@/lib/returns/state";
import { canTransitionException, assertExceptionTransition, isTerminalException, isValidExceptionType } from "@/lib/exceptions/state";

describe("returns state machine (§8)", () => {
  it("walks requested → … → closed", () => {
    const path = ["requested", "approved", "pickup_scheduled", "received", "qc", "refund", "closed"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransitionReturn(path[i], path[i + 1])).toBe(true);
  });
  it("can reject up to QC but not after refund", () => {
    expect(canTransitionReturn("requested", "rejected")).toBe(true);
    expect(canTransitionReturn("qc", "rejected")).toBe(true);
    expect(canTransitionReturn("refund", "rejected")).toBe(false);
  });
  it("forbids illegal jumps; closed/rejected terminal", () => {
    expect(canTransitionReturn("requested", "refund")).toBe(false);
    expect(() => assertReturnTransition("requested", "closed")).toThrow(/Illegal return transition/);
    expect(isTerminalReturn("closed")).toBe(true);
    expect(isTerminalReturn("rejected")).toBe(true);
  });
});

describe("exception state machine (§7)", () => {
  it("open → investigating/escalated/resolved; resolved terminal", () => {
    expect(canTransitionException("open", "investigating")).toBe(true);
    expect(canTransitionException("open", "escalated")).toBe(true);
    expect(canTransitionException("escalated", "investigating")).toBe(true);
    expect(isTerminalException("resolved")).toBe(true);
    expect(() => assertExceptionTransition("resolved", "open")).toThrow();
  });
  it("validates exception types", () => {
    expect(isValidExceptionType("courier_damaged")).toBe(true);
    expect(isValidExceptionType("nonsense")).toBe(false);
  });
});
