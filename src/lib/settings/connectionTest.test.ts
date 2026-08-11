import { describe, it, expect } from "vitest";
import { connectionResult, outcomeFromSettlement, type ConnectionOutcome } from "@/lib/settings/connectionTest";

describe("connectionTest (S2B) — reuses the frozen severity/code/action model", () => {
  it("maps each outcome to a distinct label + frozen severity + frozen diagnostic code", () => {
    expect(connectionResult("connected")).toMatchObject({ label: "Connected", severity: "healthy", diagnosticCode: "OK", recommendedAction: "" });
    expect(connectionResult("auth_failed")).toMatchObject({ label: "Authentication failed", severity: "critical", diagnosticCode: "CREDENTIALS_INVALID" });
    expect(connectionResult("config_missing")).toMatchObject({ label: "Configuration missing", severity: "critical", diagnosticCode: "MISSING_ENV_VAR" });
    expect(connectionResult("unavailable")).toMatchObject({ label: "Provider unavailable", severity: "warning", diagnosticCode: "DEGRADED" });
    expect(connectionResult("timeout")).toMatchObject({ label: "Timeout", severity: "warning", diagnosticCode: "DEGRADED" });
  });

  it("supplies a recommended action for every non-connected outcome (from the central lookup)", () => {
    for (const o of ["auth_failed", "config_missing", "unavailable", "timeout"] as ConnectionOutcome[]) {
      expect(connectionResult(o).recommendedAction.length).toBeGreaterThan(0);
    }
    expect(connectionResult("connected").recommendedAction).toBe("");
    expect(connectionResult("auth_failed").recommendedAction).toMatch(/verify the provider credentials/i);
  });

  it("interprets a read-only settlement result into the right outcome", () => {
    expect(outcomeFromSettlement({ available: true })).toBe("connected");
    expect(outcomeFromSettlement({ available: false, error: "not_configured" })).toBe("config_missing");
    expect(outcomeFromSettlement({ available: true, error: "http_401" })).toBe("auth_failed");
    expect(outcomeFromSettlement({ available: true, error: "http_403" })).toBe("auth_failed");
    expect(outcomeFromSettlement({ available: true, error: "http_500" })).toBe("unavailable");
    expect(outcomeFromSettlement({ available: false, error: "fetch failed" })).toBe("unavailable");
    expect(outcomeFromSettlement(null)).toBe("unavailable");
  });
});
