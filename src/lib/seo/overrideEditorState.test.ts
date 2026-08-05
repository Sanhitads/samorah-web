import { describe, it, expect } from "vitest";
import { EMPTY_OVERRIDE_DRAFT, discardDraft, shouldAutoOpenAdvanced, preserveDraftAcrossDisclosure, type SeoOverrideDraft } from "./overrideEditorState";

const populated: SeoOverrideDraft = {
  path: "/about", title: "About Samorah", description: "d", ogImage: "https://x/y.jpg",
  robots: "noindex", canonical: "https://samorahstudio.com/about", sitemapPriority: "0.8", changeFreq: "weekly",
};

describe("SEO override editor state (Increment G — discard & disclosure safety)", () => {
  it("Discard resets to an empty, route-less draft — it cannot address a persisted override", () => {
    const d = discardDraft();
    expect(d).toEqual(EMPTY_OVERRIDE_DRAFT);
    expect(d.path).toBe(""); // no route ⇒ Save has no target; deletion is a separate, confirmed action
    // fresh object per call — discarding never mutates the shared empty constant
    d.title = "x";
    expect(EMPTY_OVERRIDE_DRAFT.title).toBe("");
    expect(discardDraft().title).toBe("");
  });

  it("Discard does not carry the edited override's identity or values", () => {
    // Simulate: user was editing `populated`, then hits Discard.
    const afterDiscard = discardDraft();
    expect(afterDiscard.path).not.toBe(populated.path);
    expect(afterDiscard).not.toEqual(populated);
  });

  it("Advanced-sitemap disclosure auto-opens only when sitemap values exist", () => {
    expect(shouldAutoOpenAdvanced(EMPTY_OVERRIDE_DRAFT)).toBe(false);
    expect(shouldAutoOpenAdvanced({ sitemapPriority: "0.8", changeFreq: "" })).toBe(true);
    expect(shouldAutoOpenAdvanced({ sitemapPriority: "", changeFreq: "weekly" })).toBe(true);
    expect(shouldAutoOpenAdvanced({ sitemapPriority: "", changeFreq: "" })).toBe(false);
  });

  it("Collapsing/expanding the disclosure preserves every draft value (values survive collapse)", () => {
    for (const open of [false, true]) {
      const r = preserveDraftAcrossDisclosure(populated, open);
      expect(r.open).toBe(open);
      expect(r.draft).toEqual(populated); // nothing cleared by the toggle
      expect(r.draft.sitemapPriority).toBe("0.8"); // the values that would be lost if collapse cleared them
      expect(r.draft.changeFreq).toBe("weekly");
    }
  });
});
