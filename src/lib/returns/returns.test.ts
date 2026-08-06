import { describe, it, expect } from "vitest";
import { canTransitionReturn, assertReturnTransition, isTerminalReturn } from "@/lib/returns/state";
import { canTransitionException, assertExceptionTransition, isTerminalException, isValidExceptionType } from "@/lib/exceptions/state";
import { requiresPhysicalReturn, isReceivingInconsistent, resolutionWaivesReturn, RESOLUTIONS } from "@/lib/returns/resolution";

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

describe("resolution → physical-return authority (Phase 1B-1)", () => {
  // The COMPLETE mapping, pinned. Only return_required needs goods back; the rest keep the product
  // with the customer or send goods OUT. Derived from resolutionWaivesReturn + computeReturnFinance.
  const MAP: Record<string, boolean> = {
    return_required: true,
    return_waived: false,
    refund_only: false,
    replacement_only: false,
    exchange: false,
    partial_refund: false,
    reject_claim: false,
  };

  it("every supported resolution has a pinned YES/NO (case 27)", () => {
    // guard against silent drift: the catalog and the map must stay in lockstep
    expect(new Set(RESOLUTIONS.map((r) => r.value))).toEqual(new Set(Object.keys(MAP)));
    for (const [resolution, expected] of Object.entries(MAP)) {
      expect(requiresPhysicalReturn(resolution)).toBe(expected);
    }
  });

  it("only return_required requires a physical return", () => {
    expect(requiresPhysicalReturn("return_required")).toBe(true);
    expect(requiresPhysicalReturn("return_waived")).toBe(false);
    expect(requiresPhysicalReturn("refund_only")).toBe(false);
  });

  it("null/unset resolution is non-blocking (goods expected back only on explicit return_required)", () => {
    expect(requiresPhysicalReturn(null)).toBe(false);
    expect(requiresPhysicalReturn(undefined)).toBe(false);
  });

  it("is the exact positive complement of resolutionWaivesReturn for every enumerated value", () => {
    for (const { value } of RESOLUTIONS) {
      expect(requiresPhysicalReturn(value)).toBe(!resolutionWaivesReturn(value));
    }
  });

  it("flags an inconsistent lifecycle: no-return resolution in a physical receiving state (case 28)", () => {
    expect(isReceivingInconsistent("return_waived", "received")).toBe(true);
    expect(isReceivingInconsistent("refund_only", "inspection")).toBe(true);
    // consistent: return_required in a physical state is expected, not flagged
    expect(isReceivingInconsistent("return_required", "received")).toBe(false);
    // consistent: no-return resolution in a non-physical state
    expect(isReceivingInconsistent("return_waived", "approved")).toBe(false);
    // unset resolution is undetermined, not an inconsistency to report
    expect(isReceivingInconsistent(null, "received")).toBe(false);
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
