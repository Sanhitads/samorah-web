import { describe, it, expect } from "vitest";
import { safeHref } from "@/lib/safeHref";

describe("safeHref (CMS link protocol allowlist)", () => {
  it("passes through legitimate link targets", () => {
    expect(safeHref("https://samorah.in")).toBe("https://samorah.in");
    expect(safeHref("http://x.com/a")).toBe("http://x.com/a");
    expect(safeHref("/chapters")).toBe("/chapters");
    expect(safeHref("/")).toBe("/");
    expect(safeHref("#reviews")).toBe("#reviews");
    expect(safeHref("mailto:hello@samorah.in")).toBe("mailto:hello@samorah.in");
    expect(safeHref("tel:+919000000000")).toBe("tel:+919000000000");
    expect(safeHref("products/kashmiri-chai")).toBe("products/kashmiri-chai");
  });
  it("neutralises dangerous or unexpected schemes to '#'", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("JavaScript:alert(1)")).toBe("#");
    expect(safeHref("data:text/html,evil")).toBe("#");
    expect(safeHref("vbscript:msgbox(1)")).toBe("#");
    expect(safeHref("//evil.com")).toBe("#"); // protocol-relative → off-site
  });
  it("handles empty / nullish", () => {
    expect(safeHref("")).toBe("#");
    expect(safeHref("   ")).toBe("#");
    expect(safeHref(null)).toBe("#");
    expect(safeHref(undefined)).toBe("#");
  });
});
