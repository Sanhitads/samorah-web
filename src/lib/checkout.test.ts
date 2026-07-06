import { describe, it, expect } from "vitest";
import { pinStateMismatch, validateAddress, businessSchema, fieldErrors } from "@/lib/checkout";

describe("checkout validation", () => {
  it("CK-009 — PIN ↔ state cross-check (Delhi PIN + Maharashtra → mismatch)", () => {
    expect(pinStateMismatch("110001", "Maharashtra")).toBe(true); // Delhi PIN, wrong state
    expect(pinStateMismatch("110001", "Delhi")).toBe(false); // correct
    expect(pinStateMismatch("400001", "Maharashtra")).toBe(false); // Mumbai PIN, correct
    expect(pinStateMismatch("560001", "Karnataka")).toBe(false); // Bengaluru, correct
    expect(pinStateMismatch("999999", "Maharashtra")).toBe(false); // unknown prefix → never blocks
    expect(pinStateMismatch("40", "Maharashtra")).toBe(false); // not a 6-digit PIN → skip
  });

  it("CK-001..005 — shipping address validation", () => {
    expect(validateAddress({ fullName: "", email: "x", phone: "1", pincode: "12" })).toMatchObject({
      fullName: expect.any(String),
      email: expect.any(String),
      phone: expect.any(String),
      pincode: expect.any(String),
    });
    const ok = validateAddress({
      fullName: "Aria Sen", email: "aria@example.com", phone: "9876543210",
      line1: "12 Palm Road", city: "Mumbai", state: "Maharashtra", pincode: "400001",
    });
    expect(Object.keys(ok)).toHaveLength(0);
  });

  it("CK-008 — GSTIN format validation", () => {
    expect(fieldErrors(businessSchema, { companyName: "Acme Co", gstin: "27AAAAA0000A1Z5" })).toEqual({});
    expect(fieldErrors(businessSchema, { companyName: "Acme Co", gstin: "BADGSTIN" })).toHaveProperty("gstin");
  });
});
