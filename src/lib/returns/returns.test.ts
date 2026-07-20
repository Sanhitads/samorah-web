import { describe, it, expect } from "vitest";
import { canTransitionReturn, assertReturnTransition, isTerminalReturn } from "@/lib/returns/state";
import { canTransitionException, assertExceptionTransition, isTerminalException, isValidExceptionType } from "@/lib/exceptions/state";

describe("returns state machine (§8 — Resolution Center)", () => {
  it("walks the physical-return path requested → … → refunded → closed", () => {
    const path = ["requested", "under_review", "approved", "return_required", "in_transit", "received", "inspection", "refund_processing", "refunded", "closed"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransitionReturn(path[i], path[i + 1])).toBe(true);
  });
  it("supports the RETURN-WAIVED branch: approved → refund / replacement / close without a pickup", () => {
    expect(canTransitionReturn("approved", "refund_processing")).toBe(true);
    expect(canTransitionReturn("approved", "replacement_shipped")).toBe(true);
    expect(canTransitionReturn("approved", "closed")).toBe(true);
    // waived never routes through return_required/in_transit unless the admin chooses it
    expect(canTransitionReturn("approved", "return_required")).toBe(true);
  });
  it("'both' = refund then replacement", () => {
    expect(canTransitionReturn("refunded", "replacement_shipped")).toBe(true);
    expect(canTransitionReturn("replacement_shipped", "closed")).toBe(true);
  });
  it("can reject up to inspection but not once a refund is processing", () => {
    expect(canTransitionReturn("requested", "rejected")).toBe(true);
    expect(canTransitionReturn("under_review", "rejected")).toBe(true);
    expect(canTransitionReturn("inspection", "rejected")).toBe(true);
    expect(canTransitionReturn("refund_processing", "rejected")).toBe(false);
  });
  it("forbids illegal jumps; closed/rejected terminal", () => {
    expect(canTransitionReturn("requested", "refund_processing")).toBe(false);
    expect(canTransitionReturn("received", "refunded")).toBe(false);
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
