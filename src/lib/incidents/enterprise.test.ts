/**
 * Phase 4 (enterprise readiness) pure-logic tests. Confidence, priority matrix, SLA, dynamic +
 * calendar thresholds, auto-assignment, cost, suppression/maintenance matching, dependency graph,
 * and escalation countdown — all deterministic and explainable, locked here.
 */
import { describe, it, expect } from "vitest";
import {
  computeConfidence, impactLevelFromOrders, priorityFrom, applyPriorityFloor, slaStatus, slaTargetFor,
  timeContext, activeCalendarPeriod, effectiveThreshold, boostSeverity, matchAutoAssign, estimateCost,
  suppressionMatches, maintenanceActive, dependencyDownstream, nextEscalationInfo,
} from "./engine";
import { ESCALATION_POLICY, COST_MODEL } from "@/config/incidents";

describe("confidence score", () => {
  it("sums attributable factors and caps at 100", () => {
    const r = computeConfidence({ eventCount: 20, threshold: 10, reasonMatched: true, rootCauseSystem: "razorpay", windowMinutes: 5, spanMinutes: 1 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThan(80);
    expect(r.reasons.map((x) => x.factor)).toEqual(expect.arrayContaining(["rule_fired", "event_volume", "reason_matched", "known_root_cause", "tight_window"]));
    expect(r.reasons.reduce((a, b) => a + b.points, 0)).toBe(r.score);
  });
  it("is lower with a bare rule firing and unknown cause", () => {
    const r = computeConfidence({ eventCount: 10, threshold: 10, reasonMatched: false, rootCauseSystem: "unknown", windowMinutes: 30, spanMinutes: 29 });
    expect(r.score).toBe(40);
  });
});

describe("priority matrix (severity × impact)", () => {
  it("buckets impact from affected orders", () => {
    expect(impactLevelFromOrders(25)).toBe("high");
    expect(impactLevelFromOrders(8)).toBe("medium");
    expect(impactLevelFromOrders(1)).toBe("low");
    expect(impactLevelFromOrders(0)).toBe("none");
  });
  it("priority is distinct from severity", () => {
    expect(priorityFrom("high", "low")).toBe("p2");
    expect(priorityFrom("high", "high")).toBe("p1");
    expect(priorityFrom("low", "low")).toBe("p4");
    expect(priorityFrom("critical", "none")).toBe("p2"); // critical but no impact → not P1
  });
  it("a priority floor cannot weaken a stronger computed priority", () => {
    expect(applyPriorityFloor("p1", "p2")).toBe("p1");   // keep the stronger
    expect(applyPriorityFloor("p4", "p2")).toBe("p2");   // raise to floor
  });
});

describe("SLA", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");
  it("targets by priority", () => { expect(slaTargetFor("p1")).toBe(30); expect(slaTargetFor("p4")).toBe(1440); });
  it("on track / at risk / breached / met", () => {
    expect(slaStatus(new Date(now + 30 * 60000).toISOString(), null, now).status).toBe("on_track");
    expect(slaStatus(new Date(now + 5 * 60000).toISOString(), null, now).status).toBe("at_risk");
    expect(slaStatus(new Date(now - 5 * 60000).toISOString(), null, now).status).toBe("breached");
    expect(slaStatus(new Date(now + 30 * 60000).toISOString(), new Date(now + 10 * 60000).toISOString(), now).status).toBe("met");
    expect(slaStatus(null, null, now).status).toBe("none");
  });
});

describe("dynamic + calendar thresholds", () => {
  it("classifies time context in IST", () => {
    // 2026-07-15 is a Wednesday. 06:00 UTC = 11:30 IST (business); 20:00 UTC = 01:30 IST (off-hours).
    expect(timeContext(Date.parse("2026-07-15T06:00:00Z"))).toBe("businessHours");
    expect(timeContext(Date.parse("2026-07-15T20:00:00Z"))).toBe("offHours");
    // 2026-07-18 is a Saturday → weekend.
    expect(timeContext(Date.parse("2026-07-18T06:00:00Z"))).toBe("weekend");
  });
  it("business calendar overrides and tightens the threshold", () => {
    const diwali = Date.parse("2026-10-28T10:00:00+05:30");
    expect(activeCalendarPeriod(diwali)?.name).toContain("Diwali");
    const eff = effectiveThreshold(5, diwali);
    expect(eff.threshold).toBe(2);           // 5 × 0.4 = 2 (min floor)
    expect(eff.severityBoost).toBe(1);
  });
  it("off-hours loosens (×4), weekend ×2, business ×1", () => {
    expect(effectiveThreshold(5, Date.parse("2026-07-15T20:00:00Z")).threshold).toBe(20); // off-hours
    expect(effectiveThreshold(5, Date.parse("2026-07-18T06:00:00Z")).threshold).toBe(10); // weekend
    expect(effectiveThreshold(5, Date.parse("2026-07-15T06:00:00Z")).threshold).toBe(5);  // business
  });
  it("severity boost climbs ranks", () => {
    expect(boostSeverity("medium", 1)).toBe("high");
    expect(boostSeverity("high", 2)).toBe("critical");
    expect(boostSeverity("critical", 1)).toBe("critical");
  });
});

describe("advanced auto-assignment", () => {
  it("high-value refund routes to Finance Manager", () => {
    const r = matchAutoAssign({ category: "refund", revenue: 15000, severity: "high" });
    expect(r?.team).toBe("finance"); expect(r?.assignRole).toBe("manager");
  });
  it("a small refund does not match the high-value rule", () => {
    const r = matchAutoAssign({ category: "refund", revenue: 500, severity: "low" });
    expect(r?.assignRole).toBeUndefined();  // falls through to a plain team rule or null
  });
  it("shiprocket routes to warehouse", () => {
    expect(matchAutoAssign({ category: "shipment", rootCauseSystem: "shiprocket", severity: "medium" })?.team).toBe("warehouse");
  });
});

describe("cost of incident", () => {
  it("sums the deterministic parts", () => {
    const { total, parts } = estimateCost({ revenue: 100000, refundValue: 5000, shipmentsDelayed: 3, slaBreached: true, ageHours: 2 });
    expect(parts.revenueAtRisk).toBe(Math.round(100000 * COST_MODEL.revenueAtRiskPct));
    expect(parts.slaPenalty).toBe(COST_MODEL.slaBreachPenalty);
    expect(parts.delayedShipments).toBe(3 * COST_MODEL.perDelayedShipment);
    expect(total).toBe(Object.values(parts).reduce((a, b) => a + b, 0));
  });
  it("no SLA penalty when not breached", () => {
    expect(estimateCost({ revenue: 0, refundValue: 0, shipmentsDelayed: 0, slaBreached: false, ageHours: 0 }).total).toBe(0);
  });
});

describe("suppression + maintenance matching", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");
  it("suppression matches by category + is time-bounded", () => {
    const rule = { enabled: true, category: "email", subsystem: null, root_cause_system: null, reason_pattern: null, starts_at: null, ends_at: null };
    expect(suppressionMatches(rule, { category: "email", subsystem: "email", rootCauseSystem: "smtp", reason: "bounce" }, now)).toBe(true);
    expect(suppressionMatches(rule, { category: "refund" }, now)).toBe(false);
    expect(suppressionMatches({ ...rule, ends_at: new Date(now - 1000).toISOString() }, { category: "email" }, now)).toBe(false); // expired
    expect(suppressionMatches({ ...rule, enabled: false }, { category: "email" }, now)).toBe(false);
  });
  it("maintenance window matches a system within its time box", () => {
    const win = { enabled: true, root_cause_system: "shiprocket", subsystem: null, starts_at: new Date(now - 60000).toISOString(), ends_at: new Date(now + 60000).toISOString() };
    expect(maintenanceActive(win, { rootCauseSystem: "shiprocket" }, now)).toBe(true);
    expect(maintenanceActive(win, { rootCauseSystem: "razorpay" }, now)).toBe(false);
    expect(maintenanceActive({ ...win, ends_at: new Date(now - 1).toISOString() }, { rootCauseSystem: "shiprocket" }, now)).toBe(false);
  });
});

describe("dependency graph + escalation countdown", () => {
  it("finds downstream systems (BFS)", () => {
    const down = dependencyDownstream("razorpay");
    expect(down).toEqual(expect.arrayContaining(["payments", "refund", "email", "webhook"]));
  });
  it("computes the next escalation time", () => {
    const started = Date.parse("2026-07-15T12:00:00Z");
    const next = nextEscalationInfo(started, 0, ESCALATION_POLICY);
    expect(next?.level).toBe(1);
    expect(next?.atMs).toBe(started + 30 * 60000);
    expect(nextEscalationInfo(started, 3, ESCALATION_POLICY)).toBeNull(); // nothing after the last level
  });
});
