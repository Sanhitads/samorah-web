import { describe, it, expect } from "vitest";
import {
  SETTINGS_INTEGRATIONS, INTEGRATION_IDS, INTEGRATION_REGISTRY_VERSION, RECOMMENDED_ACTIONS,
  getIntegration, recommendedAction, severityFromHealthStatus, severityFromChannelState, worstSeverity,
  type DiagnosticCode,
} from "@/lib/settings/integrationRegistry";
import { MAPPED_INTEGRATION_IDS, summarizeIntegrations, launchReadiness, type IntegrationStatus } from "@/services/settingsIntegrationsService";

const st = (sev: IntegrationStatus["severity"]): IntegrationStatus => ({
  id: "analytics", provider: "p", owningModule: "Analytics", severity: sev, diagnosticCode: "OK", reason: "",
  recommendedAction: "", configurationSource: "", serviceOwner: "", lastSuccessAt: null, timestampSource: null, extraIssues: 0,
});

describe("Integration Registry (S1A)", () => {
  it("declares a version", () => {
    expect(INTEGRATION_REGISTRY_VERSION).toBe("v1");
  });

  it("structural completeness — every entry declares all required sources + a recommended-action mapping", () => {
    for (const e of SETTINGS_INTEGRATIONS) {
      expect(e.id, "id").toBeTruthy();
      expect(e.provider, `${e.id} provider`).toBeTruthy();
      expect(e.owningModule, `${e.id} owningModule`).toBeTruthy();
      expect(e.healthSource, `${e.id} healthSource`).toBeTruthy();
      expect(e.diagnosticsSource, `${e.id} diagnosticsSource`).toBeTruthy();
      expect(e.configurationSource, `${e.id} configurationSource`).toBeTruthy();
      expect(e.serviceOwner, `${e.id} serviceOwner`).toBeTruthy();
      expect("timestampSource" in e, `${e.id} timestampSource declared`).toBe(true);
      expect("auditSource" in e, `${e.id} auditSource declared`).toBe(true);
    }
  });

  it("stable ids are unique and match the v1 set", () => {
    expect(new Set(INTEGRATION_IDS).size).toBe(INTEGRATION_IDS.length);
    expect([...INTEGRATION_IDS].sort()).toEqual(["analytics", "email", "notifications", "payment"]);
    expect(getIntegration("payment")?.provider).toBe("Razorpay");
    expect(getIntegration("nope")).toBeUndefined();
  });

  it("registry authority — the aggregator renders EXACTLY the registry ids (no bypass, no missing)", () => {
    expect([...MAPPED_INTEGRATION_IDS].sort()).toEqual([...INTEGRATION_IDS].sort());
  });

  it("every integration id has a recommended-action-capable diagnostic path (central lookup)", () => {
    // The lookup covers every frozen code; recommendedAction never throws / always returns a string.
    const codes: DiagnosticCode[] = ["OK", "MISSING_ENV_VAR", "WEBHOOK_SECRET_MISSING", "PROVIDER_DISABLED", "CREDENTIALS_INVALID", "DEGRADED", "NO_RECENT_ACTIVITY", "UNKNOWN"];
    for (const c of codes) expect(typeof RECOMMENDED_ACTIONS[c]).toBe("string");
    expect(recommendedAction("WEBHOOK_SECRET_MISSING")).toMatch(/webhook secret/i);
    expect(recommendedAction("OK")).toBe("");
  });

  it("severity maps — health status → severity (unknown fallback)", () => {
    expect(severityFromHealthStatus("ok")).toBe("healthy");
    expect(severityFromHealthStatus("warn")).toBe("warning");
    expect(severityFromHealthStatus("off")).toBe("critical");
    expect(severityFromHealthStatus("down")).toBe("critical");
    expect(severityFromHealthStatus("weird")).toBe("unknown");
  });

  it("severity maps — channel state → severity (dormant is neutral)", () => {
    expect(severityFromChannelState("healthy")).toBe("healthy");
    expect(severityFromChannelState("degraded")).toBe("warning");
    expect(severityFromChannelState("failing")).toBe("critical");
    expect(severityFromChannelState("dormant")).toBe("unknown");
    expect(severityFromChannelState("???")).toBe("unknown");
  });

  it("worstSeverity picks the most severe (critical > warning > healthy > unknown)", () => {
    expect(worstSeverity(["healthy", "critical", "warning"])).toBe("critical");
    expect(worstSeverity(["unknown", "healthy"])).toBe("healthy");
    expect(worstSeverity([])).toBe("unknown");
    expect(worstSeverity(["unknown", "unknown"])).toBe("unknown");
  });

  it("summary counts by severity; launch readiness derives ok = healthy only", () => {
    const statuses = [st("healthy"), st("healthy"), st("warning"), st("critical")];
    expect(summarizeIntegrations(statuses)).toEqual({ healthy: 2, warning: 1, critical: 1, unknown: 0, total: 4 });
    const lr = launchReadiness(statuses);
    expect(lr.map((i) => i.ok)).toEqual([true, true, false, false]);
  });
});
