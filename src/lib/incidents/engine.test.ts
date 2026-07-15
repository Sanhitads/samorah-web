import { describe, it, expect } from "vitest";
import {
  severityRank, highestSeverity, ruleTriggered, matchesReason, deriveAlertKey,
  isActiveStatus, shouldMergeInto, allNotificationsResolved, formatIncidentNumber, incidentTitle,
} from "./engine";
import type { IncidentRule } from "@/config/incidents";

const RULE: IncidentRule = {
  id: "refund_gateway_timeout", category: "refund", title: "Refund failures — gateway timeout", sourceSystem: "Razorpay",
  table: "refunds", statusColumn: "status", statusValue: "failed", reasonColumns: ["error_description", "reason"],
  reasonPattern: "timeout|gateway|network|5\\d\\d", rootCauseLabel: "Gateway timeout", alertKeyPrefix: "refund_failed:order",
  notificationSeverity: "high", threshold: 5, windowMinutes: 5, mergeWindowMinutes: 30, enabled: true,
};
const NOW = 1_700_000_000_000;

describe("severity inheritance", () => {
  it("ranks severities correctly", () => {
    expect(severityRank("critical")).toBeGreaterThan(severityRank("high"));
    expect(severityRank("high")).toBeGreaterThan(severityRank("medium"));
    expect(severityRank("info")).toBe(1);
  });
  it("inherits the HIGHEST severity from the attached notifications", () => {
    expect(highestSeverity(["medium", "high", "info"])).toBe("high");
    expect(highestSeverity(["low", "info"])).toBe("low");
    expect(highestSeverity(["critical", "high"])).toBe("critical");
  });
  it("defaults to info when there are no notifications", () => {
    expect(highestSeverity([])).toBe("info");
  });
});

describe("rule firing", () => {
  it("fires only at/above the threshold", () => {
    expect(ruleTriggered(4, RULE)).toBe(false);
    expect(ruleTriggered(5, RULE)).toBe(true);
    expect(ruleTriggered(50, RULE)).toBe(true);
  });
  it("never fires when the rule is disabled", () => {
    expect(ruleTriggered(100, { ...RULE, enabled: false })).toBe(false);
  });
  it("matches the root-cause reason (case-insensitive), or all when no pattern", () => {
    expect(matchesReason("Gateway Timeout", RULE.reasonPattern)).toBe(true);
    expect(matchesReason("insufficient balance", RULE.reasonPattern)).toBe(false);
    expect(matchesReason("503 Service Unavailable", RULE.reasonPattern)).toBe(true);
    expect(matchesReason("anything", undefined)).toBe(true);
  });
  it("derives the notification alert key the notification center uses", () => {
    expect(deriveAlertKey(RULE, "SAM-2026-000004")).toBe("refund_failed:order:SAM-2026-000004");
  });
});

describe("merge decision", () => {
  const base = { category: "refund", ruleId: "refund_gateway_timeout", status: "open" as const, lastActivityAt: new Date(NOW - 10 * 60000).toISOString() };
  it("merges into an active same-category+rule incident inside the merge window", () => {
    expect(shouldMergeInto(base, RULE, NOW)).toBe(true);
  });
  it("does NOT merge past the merge window", () => {
    expect(shouldMergeInto({ ...base, lastActivityAt: new Date(NOW - 31 * 60000).toISOString() }, RULE, NOW)).toBe(false);
  });
  it("does NOT merge a different category or rule", () => {
    expect(shouldMergeInto({ ...base, category: "shipment" }, RULE, NOW)).toBe(false);
    expect(shouldMergeInto({ ...base, ruleId: "other" }, RULE, NOW)).toBe(false);
  });
  it("does NOT merge into a resolved/closed incident", () => {
    expect(shouldMergeInto({ ...base, status: "resolved" as never }, RULE, NOW)).toBe(false);
    expect(isActiveStatus("resolved")).toBe(false);
    expect(isActiveStatus("investigating")).toBe(true);
  });
});

describe("auto-resolution", () => {
  it("resolves only when EVERY notification is resolved", () => {
    expect(allNotificationsResolved([{ resolvedAt: "x" }, { resolvedAt: "y" }])).toBe(true);
    expect(allNotificationsResolved([{ resolvedAt: "x" }, { resolvedAt: null }])).toBe(false);
    expect(allNotificationsResolved([])).toBe(false); // empty never auto-resolves
  });
});

describe("formatting", () => {
  it("formats incident numbers with 5-digit padding", () => {
    expect(formatIncidentNumber(14)).toBe("INC-00014");
    expect(formatIncidentNumber(1)).toBe("INC-00001");
  });
  it("builds a titled incident", () => {
    expect(incidentTitle(RULE, 7)).toBe("Refund failures — gateway timeout (7)");
  });
});
