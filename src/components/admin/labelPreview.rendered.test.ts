// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement as h } from "react";
import { render, cleanup } from "@testing-library/react";
import { LabelPreview, type LabelPayload } from "@/components/admin/LabelPreview";

const retail = (over: Partial<LabelPayload["verified"]> = {}): LabelPayload => ({
  purpose: "retail",
  verified: { batch_code: "KC-G100-261210-01", product_name: "Kashmiri Chai", variant: "Glass", net_quantity: "100g", manufacturing_date: "2026-12-10", lifecycle_status: "qc_approved", recall_state: "none", ...over },
  missing_business: ["manufacturer_name_and_address", "mrp_inclusive_of_taxes"], missing_legal: ["country_of_origin"], optional_branding: ["logo"],
});
afterEach(() => cleanup());

describe("LabelPreview", () => {
  it("always shows the human-readable batch code and flags missing retail fields (not fabricated)", () => {
    const { container } = render(h(LabelPreview, { payload: retail(), encodedValue: "KC-G100-261210-01" }));
    expect(container.textContent).toContain("KC-G100-261210-01");           // human-readable code present
    expect(container.textContent).toContain("Missing before print");         // missing fields surfaced
    expect(container.textContent).toContain("Manufacturer name & address");   // readable operator label, not the raw key
    expect(container.textContent).not.toContain("manufacturer_name_and_address"); // raw key not shown
    expect(container.textContent).not.toContain("✗ MISMATCH");               // encoded == code
  });

  it("marks a non-approved batch NOT FOR SALE and flags an encoded-value mismatch", () => {
    const { container } = render(h(LabelPreview, { payload: retail({ lifecycle_status: "curing" }), encodedValue: "WRONG-CODE" }));
    expect(container.textContent).toContain("NOT FOR SALE");
    expect(container.textContent).toContain("✗ MISMATCH");
  });

  it("labels internal purpose as internal, not retail", () => {
    const { container } = render(h(LabelPreview, { payload: { ...retail(), purpose: "internal_mfg" } }));
    expect(container.textContent).toContain("INTERNAL — NOT A RETAIL LABEL");
  });
});
