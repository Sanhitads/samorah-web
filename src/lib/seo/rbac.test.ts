import { describe, it, expect } from "vitest";
import { requiredCapabilityFor, isMutation } from "./rbac";
import { hasCapability } from "@/lib/auth/capabilities";

describe("SEO/redirect RBAC mapping (point 13)", () => {
  it("every mutation requires content.publish", () => {
    for (const a of ["redirect.save", "redirect.delete", "seo.save", "seo.delete"]) {
      expect(requiredCapabilityFor(a)).toBe("content.publish");
      expect(isMutation(a)).toBe(true);
    }
  });
  it("read-only actions require only content.edit", () => {
    for (const a of ["redirect.analyze", "seo.analyze", "seo.effective"]) {
      expect(requiredCapabilityFor(a)).toBe("content.edit");
      expect(isMutation(a)).toBe(false);
    }
  });
  it("unknown actions map to no capability (rejected)", () => {
    expect(requiredCapabilityFor("evil.action")).toBeNull();
  });

  // Authorization proof: a principal with content.edit but NOT content.publish cannot mutate.
  it("a content.edit-only actor is denied every SEO mutation", () => {
    const editorCaps = new Set(["content.edit"]); // has edit, lacks publish
    for (const a of ["redirect.save", "redirect.delete", "seo.save", "seo.delete"]) {
      const need = requiredCapabilityFor(a)!;
      expect(editorCaps.has(need)).toBe(false); // needs content.publish, which they lack → denied
    }
    // …but the same actor may run read-only analysis.
    expect(editorCaps.has(requiredCapabilityFor("seo.analyze")!)).toBe(true);
  });

  it("no non-admin role carries content.publish (server gate holds today)", () => {
    for (const role of ["customer", "editor", "manager"]) expect(hasCapability(role, "content.publish")).toBe(false);
    for (const role of ["admin", "super_admin"]) expect(hasCapability(role, "content.publish")).toBe(true);
  });
});
