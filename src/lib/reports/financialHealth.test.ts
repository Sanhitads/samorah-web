import { describe, it, expect } from "vitest";
import { assessFinancialHealth, type HealthInputs } from "@/lib/reports/financialHealth";

/** Stage R2 — the Financial Health banner maps existing conditions to the correct severity. */
const clean: HealthInputs = {
  variantsMissingCost: 0, revenue: 100_000, gstCollected: 12_000, refunds: 0,
  shippingCostPerOrder: 60, paymentFeePercent: 2,
};

describe("assessFinancialHealth (R2)", () => {
  it("healthy when everything is configured (gateway-estimate is info, not a warning)", () => {
    const h = assessFinancialHealth(clean);
    expect(h.severity).toBe("healthy");
    expect(h.items.every((i) => i.severity === "info")).toBe(true);
  });

  it("Attention Required when product costs are missing", () => {
    const h = assessFinancialHealth({ ...clean, variantsMissingCost: 3 });
    expect(h.severity).toBe("attention");
    expect(h.items.some((i) => i.severity === "attention" && /cost price/i.test(i.text))).toBe(true);
  });

  it("Warning when courier shipping cost is not configured", () => {
    expect(assessFinancialHealth({ ...clean, shippingCostPerOrder: 0 }).severity).toBe("warning");
  });

  it("Warning when the gateway fee is not configured", () => {
    expect(assessFinancialHealth({ ...clean, paymentFeePercent: 0 }).severity).toBe("warning");
  });

  it("Warning when revenue exists but no GST was recorded (tax config)", () => {
    const h = assessFinancialHealth({ ...clean, gstCollected: 0 });
    expect(h.severity).toBe("warning");
    expect(h.items.some((i) => /tax configuration/i.test(i.text))).toBe(true);
  });

  it("refunds add a conservative-model info note without raising severity on their own", () => {
    const h = assessFinancialHealth({ ...clean, refunds: 5_000 });
    expect(h.severity).toBe("healthy");
    expect(h.items.some((i) => i.severity === "info" && /conservative/i.test(i.text))).toBe(true);
  });

  it("attention outranks warning when both are present", () => {
    const h = assessFinancialHealth({ ...clean, variantsMissingCost: 1, shippingCostPerOrder: 0 });
    expect(h.severity).toBe("attention");
  });
});
