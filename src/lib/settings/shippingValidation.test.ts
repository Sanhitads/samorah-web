import { describe, it, expect } from "vitest";
import { validateShipping } from "@/lib/settings/shippingValidation";

describe("validateShipping", () => {
  it("accepts a normal whole-rupee threshold", () => {
    expect(validateShipping({ freeThreshold: 1499 })).toEqual([]);
  });

  it("accepts 0 (everything ships free)", () => {
    expect(validateShipping({ freeThreshold: 0 })).toEqual([]);
  });

  it("rejects negatives with a corrective message", () => {
    const errs = validateShipping({ freeThreshold: -1 });
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe("freeThreshold");
    expect(errs[0].message).toMatch(/whole number of rupees/);
  });

  it("rejects non-integers (paise) and NaN", () => {
    expect(validateShipping({ freeThreshold: 1499.5 })).toHaveLength(1);
    expect(validateShipping({ freeThreshold: Number("abc") })).toHaveLength(1);
  });

  it("rejects values above the sane maximum", () => {
    expect(validateShipping({ freeThreshold: 1_000_001 })).toHaveLength(1);
    expect(validateShipping({ freeThreshold: 1_000_000 })).toEqual([]);
  });
});
