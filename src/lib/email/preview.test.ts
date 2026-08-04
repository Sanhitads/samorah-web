import { describe, it, expect } from "vitest";
import { previewWidth, PREVIEW_WIDTH } from "./preview";

describe("previewWidth (point 16 — desktop/mobile switch)", () => {
  it("returns a wider frame for desktop than mobile", () => {
    expect(previewWidth("desktop")).toBe(PREVIEW_WIDTH.desktop);
    expect(previewWidth("mobile")).toBe(PREVIEW_WIDTH.mobile);
    expect(previewWidth("desktop")).toBeGreaterThan(previewWidth("mobile"));
  });
  it("falls back to desktop for an unknown mode", () => {
    // @ts-expect-error exercising the runtime fallback
    expect(previewWidth("tablet")).toBe(PREVIEW_WIDTH.desktop);
  });
});
