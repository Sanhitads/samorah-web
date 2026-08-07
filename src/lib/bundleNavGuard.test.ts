import { describe, it, expect } from "vitest";
import { shouldGuardNavigation, type NavClickInput } from "@/lib/bundleNavGuard";

const CURRENT = { origin: "https://app.samorah.test", pathname: "/admin/bundles" };
const base: NavClickInput = {
  button: 0,
  modified: false,
  rawHref: "/admin/products",
  absoluteHref: "https://app.samorah.test/admin/products",
  target: null,
  download: false,
};

describe("shouldGuardNavigation (Phase 2A-1)", () => {
  it("guards a plain primary-button click to a different same-origin admin path", () => {
    expect(shouldGuardNavigation(base, CURRENT)).toBe(true);
  });

  it("does NOT guard non-primary buttons (middle/right click)", () => {
    expect(shouldGuardNavigation({ ...base, button: 1 }, CURRENT)).toBe(false);
    expect(shouldGuardNavigation({ ...base, button: 2 }, CURRENT)).toBe(false);
  });

  it("does NOT guard modified clicks (Ctrl/Cmd/Shift/Alt → new tab/window)", () => {
    expect(shouldGuardNavigation({ ...base, modified: true }, CURRENT)).toBe(false);
  });

  it("does NOT guard hash-only, target=_blank, or download links", () => {
    expect(shouldGuardNavigation({ ...base, rawHref: "#section" }, CURRENT)).toBe(false);
    expect(shouldGuardNavigation({ ...base, target: "_blank" }, CURRENT)).toBe(false);
    expect(shouldGuardNavigation({ ...base, download: true }, CURRENT)).toBe(false);
  });

  it("does NOT guard anchors without an href", () => {
    expect(shouldGuardNavigation({ ...base, rawHref: null }, CURRENT)).toBe(false);
  });

  it("does NOT guard cross-origin links (browser leaves the app anyway)", () => {
    expect(
      shouldGuardNavigation(
        { ...base, rawHref: "https://elsewhere.test/x", absoluteHref: "https://elsewhere.test/x" },
        CURRENT,
      ),
    ).toBe(false);
  });

  it("does NOT guard same-path links (query/hash-only navigations stay on the page)", () => {
    expect(
      shouldGuardNavigation(
        { ...base, rawHref: "/admin/bundles?tab=x", absoluteHref: "https://app.samorah.test/admin/bundles?tab=x" },
        CURRENT,
      ),
    ).toBe(false);
  });

  it("does NOT guard an unparseable absolute href", () => {
    expect(shouldGuardNavigation({ ...base, absoluteHref: "::::not a url" }, CURRENT)).toBe(false);
  });
});
