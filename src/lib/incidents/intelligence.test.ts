/**
 * Phase 3 (operations intelligence) pure-logic tests. Every intelligence feature is deterministic
 * and explainable — these lock the classification, health scoring, escalation timing, resemblance,
 * and analytics math so the UI's numbers are never "magic".
 */
import { describe, it, expect } from "vitest";
import {
  classifyRootCause, subsystemHealth, overallHealth, dueEscalations, resemblance,
  withinCorrelationWindow, minutesBetween, meanMinutes, topBy, categorySubsystem,
} from "./engine";
import { ESCALATION_POLICY } from "@/config/incidents";

describe("classifyRootCause (root cause detection)", () => {
  it("attributes by source system first, with an explanation", () => {
    expect(classifyRootCause({ sourceSystem: "Razorpay", reason: "" })).toEqual({ system: "razorpay", why: "source system = Razorpay" });
    expect(classifyRootCause({ sourceSystem: "Shiprocket" }).system).toBe("shiprocket");
    expect(classifyRootCause({ sourceSystem: "Resend" }).system).toBe("smtp");
  });
  it("falls back to category and then reason patterns", () => {
    expect(classifyRootCause({ category: "inventory", reason: "stock sync failed" }).system).toBe("inventory");
    expect(classifyRootCause({ reason: "deadlock detected on connection pool" }).system).toBe("database");
    expect(classifyRootCause({ reason: "postgREST JWT expired / RLS" }).system).toBe("supabase");
  });
  it("returns unknown when nothing matches", () => {
    expect(classifyRootCause({ reason: "totally novel thing" }).system).toBe("unknown");
    expect(classifyRootCause({}).system).toBe("unknown");
  });
});

describe("subsystemHealth + overallHealth", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");
  it("healthy with no active incidents", () => {
    expect(subsystemHealth([], now).state).toBe("healthy");
  });
  it("critical with any critical incident", () => {
    const r = subsystemHealth([{ severity: "critical", startedAt: new Date(now).toISOString() }], now);
    expect(r.state).toBe("critical"); expect(r.why).toContain("critical");
  });
  it("critical when active count crosses the threshold (≥3)", () => {
    const many = Array.from({ length: 3 }, () => ({ severity: "low" as const, startedAt: new Date(now).toISOString() }));
    expect(subsystemHealth(many, now).state).toBe("critical");
  });
  it("warning for a single high, and for an old low-sev incident", () => {
    expect(subsystemHealth([{ severity: "high", startedAt: new Date(now).toISOString() }], now).state).toBe("warning");
    const old = new Date(now - 90 * 60000).toISOString();
    expect(subsystemHealth([{ severity: "low", startedAt: old }], now).why).toContain("min");
  });
  it("overall = worst subsystem", () => {
    expect(overallHealth(["healthy", "warning", "critical"])).toBe("critical");
    expect(overallHealth(["healthy", "warning"])).toBe("warning");
    expect(overallHealth(["healthy", "healthy"])).toBe("healthy");
  });
});

describe("dueEscalations (30m → manager, 1h → admin, 2h → channels)", () => {
  it("nothing due before 30 min", () => {
    expect(dueEscalations(10, 0, ESCALATION_POLICY)).toEqual([]);
  });
  it("L1 due at 35 min from level 0", () => {
    const due = dueEscalations(35, 0, ESCALATION_POLICY);
    expect(due.map((d) => d.level)).toEqual([1]);
  });
  it("a 3-hour-old un-escalated incident owes all three levels", () => {
    expect(dueEscalations(190, 0, ESCALATION_POLICY).map((d) => d.level)).toEqual([1, 2, 3]);
  });
  it("only levels beyond the current one fire", () => {
    expect(dueEscalations(65, 1, ESCALATION_POLICY).map((d) => d.level)).toEqual([2]);
    expect(dueEscalations(65, 2, ESCALATION_POLICY)).toEqual([]);
  });
});

describe("resemblance (related incidents)", () => {
  it("scores 1.0 when category, root cause and source all match", () => {
    const a = { category: "refund", rootCauseSystem: "razorpay", sourceSystem: "Razorpay" };
    expect(resemblance(a, a)).toEqual({ score: 1, reasons: expect.arrayContaining(["same category (refund)"]) });
  });
  it("partial credit for a shared root cause only", () => {
    const r = resemblance({ category: "refund", rootCauseSystem: "razorpay" }, { category: "email", rootCauseSystem: "razorpay" });
    expect(r.score).toBe(0.4);
  });
  it("zero when nothing matches", () => {
    expect(resemblance({ category: "refund" }, { category: "email" }).score).toBe(0);
  });
});

describe("correlation window + analytics math", () => {
  it("withinCorrelationWindow respects the window", () => {
    const t = Date.parse("2026-07-15T12:00:00Z");
    expect(withinCorrelationWindow(t, t + 10 * 60000, 20)).toBe(true);
    expect(withinCorrelationWindow(t, t + 30 * 60000, 20)).toBe(false);
  });
  it("minutesBetween + meanMinutes", () => {
    expect(minutesBetween("2026-07-15T12:00:00Z", "2026-07-15T12:30:00Z")).toBe(30);
    expect(meanMinutes([10, 20, 30])).toBe(20);
    expect(meanMinutes([])).toBe(null);
    expect(meanMinutes([-5, 10])).toBe(10); // negatives (clock skew) ignored
  });
  it("topBy ranks by frequency", () => {
    const rows = [{ c: "refund" }, { c: "refund" }, { c: "email" }, { c: null }];
    expect(topBy(rows, (r) => r.c)).toEqual([{ key: "refund", count: 2 }, { key: "email", count: 1 }]);
  });
  it("categorySubsystem maps categories to dashboard subsystems", () => {
    expect(categorySubsystem("payment_gateway")).toBe("payments");
    expect(categorySubsystem("shipment")).toBe("shipping");
    expect(categorySubsystem("weird")).toBe("checkout");
  });
});
