import { describe, it, expect } from "vitest";
import { emptyStateMessage } from "@/lib/analytics/emptyState";

describe("emptyStateMessage — source-specific, never generic 'No Data'", () => {
  it("integration not configured", () => {
    expect(emptyStateMessage("ga4", "not_configured")).toBe("GA4 not configured");
  });
  it("source unavailable", () => {
    expect(emptyStateMessage("clarity", "unavailable")).toBe("Clarity unavailable");
  });
  it("no data in period (with + without period)", () => {
    expect(emptyStateMessage("orders", "no_data", "last 30 days")).toBe("No orders in last 30 days");
    expect(emptyStateMessage("orders", "no_data")).toBe("No orders in the selected period");
  });
  it("permission + api_error + disabled", () => {
    expect(emptyStateMessage("orders", "permission")).toBe("Permission required");
    expect(emptyStateMessage("razorpay", "api_error")).toBe("Razorpay temporarily unavailable");
    expect(emptyStateMessage("ga4", "disabled")).toBe("GA4 is turned off");
  });
  it("never returns the literal 'No Data'", () => {
    const all = (["not_configured", "unavailable", "no_data", "permission", "api_error", "disabled"] as const)
      .map((r) => emptyStateMessage("orders", r));
    expect(all.some((m) => /no data/i.test(m))).toBe(false);
  });
});
