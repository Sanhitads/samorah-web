import { describe, it, expect, vi, afterEach } from "vitest";
import { productionOrigin, canonicalOrigin } from "@/config/site";

/**
 * Point 8 regression: admin SEO previews display the PRODUCTION site identity via the existing
 * productionOrigin() helper, while the RUNTIME canonicalOrigin() (metadata/env behaviour) is untouched.
 * This is a presentation-only distinction — no environment/metadata behaviour changes.
 */
afterEach(() => vi.unstubAllEnvs());

describe("admin preview origin (presentation) vs runtime origin (unchanged)", () => {
  it("productionOrigin() shows the production domain even under a local dev override", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");
    expect(productionOrigin()).toBe("https://samorahstudio.com"); // what the preview displays
    expect(productionOrigin()).not.toMatch(/localhost/);
  });

  it("runtime canonicalOrigin() still respects the dev override (behaviour NOT changed)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");
    expect(canonicalOrigin()).toBe("http://localhost:3000"); // runtime unchanged
  });
});
