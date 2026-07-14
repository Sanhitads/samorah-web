import { describe, it, expect } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath — post-auth open-redirect guard", () => {
  it("honours a relative in-app path (returns the user to their origin)", () => {
    expect(safeNextPath("/shop/amber-noir")).toBe("/shop/amber-noir");
    expect(safeNextPath("/account?tab=orders")).toBe("/account?tab=orders");
  });

  it("rejects absolute URLs", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe("/");
    expect(safeNextPath("http://evil.example")).toBe("/");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("falls back for null/undefined/empty/non-string", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(42 as unknown as string)).toBe("/");
  });

  it("supports a custom fallback", () => {
    expect(safeNextPath("nope", "/account")).toBe("/account");
  });
});
