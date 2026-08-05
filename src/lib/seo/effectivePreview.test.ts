import { describe, it, expect } from "vitest";
import { draftPreview } from "./effectivePreview";
import type { EffectiveSeo } from "@/services/seoRedirectService";

const eff: EffectiveSeo = {
  title: { value: "Resolved Title", provenance: "overridden" },
  description: { value: "Site default desc", provenance: "site-default" },
  canonical: { value: null, provenance: "inherited-page" },
  robots: { value: "index,follow", provenance: "not-overridden" },
  ogImage: { value: "https://cdn/x.jpg", provenance: "site-default" },
};

describe("draftPreview — effective baseline + unsaved overlay (presentation only)", () => {
  it("shows the effective/inherited baseline when the form is blank", () => {
    const p = draftPreview(eff, {});
    expect(p.title).toBe("Resolved Title");
    expect(p.description).toBe("Site default desc");
    expect(p.ogImage).toBe("https://cdn/x.jpg");
    expect(p.canonical).toBe(""); // inherited-from-page has no concrete value
  });
  it("overlays a non-empty unsaved value on top of the baseline", () => {
    const p = draftPreview(eff, { title: "My unsaved title", description: "   " });
    expect(p.title).toBe("My unsaved title");   // draft wins
    expect(p.description).toBe("Site default desc"); // blank/whitespace falls through to baseline
  });
  it("handles a null effective baseline (no override, nothing resolved yet)", () => {
    const p = draftPreview(null, { title: "Only draft" });
    expect(p.title).toBe("Only draft");
    expect(p.description).toBe("");
  });
});
