import { describe, it, expect } from "vitest";
import {
  isDirty, publicationLabel, afterEdit, afterDiscard, afterSave, afterReset, afterPublish,
  afterRestoreToDraft, afterRestorePublish, type EditorState,
} from "@/lib/bundleEditorState";
import { DEFAULT_BUNDLE_CONFIG, type BundleConfig } from "@/lib/bundleConfig";

const withHeading = (h: string): BundleConfig => ({ ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: h } });
const init = (published: BundleConfig | null = null): EditorState => {
  const base = published ?? DEFAULT_BUNDLE_CONFIG;
  return { draft: base, saved: base, published };
};

describe("bundle editor state machine (V3)", () => {
  it("A — Edit → Discard restores the last persisted draft", () => {
    let s = init();
    s = afterEdit(s, withHeading("X"));
    expect(isDirty(s)).toBe(true);
    s = afterDiscard(s);
    expect(s.draft).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(isDirty(s)).toBe(false);
  });

  it("B — Edit → Save makes the saved version the new Discard baseline", () => {
    let s = init();
    s = afterSave(afterEdit(s, withHeading("SAVED1")));
    expect(s.saved.hero.heading).toBe("SAVED1");
    expect(isDirty(s)).toBe(false);
  });

  it("C — Edit → Save → Edit → Discard restores the NEWLY SAVED version (not older/published)", () => {
    let s = init(withHeading("LIVE"));
    s = afterSave(afterEdit(s, withHeading("SAVED1")));
    s = afterEdit(s, withHeading("SAVED2-unsaved"));
    s = afterDiscard(s);
    expect(s.draft.hero.heading).toBe("SAVED1"); // the saved baseline, not LIVE
    expect(s.published?.hero.heading).toBe("LIVE"); // published unchanged
  });

  it("D — Reset draft to default: draft+saved become DEFAULT; published unchanged; Discard stays at DEFAULT", () => {
    let s = init(withHeading("LIVE"));
    s = afterEdit(s, withHeading("EDITING"));
    s = afterReset(s);
    expect(s.draft).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(s.saved).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(s.published?.hero.heading).toBe("LIVE"); // live untouched
    s = afterEdit(s, withHeading("Z"));
    s = afterDiscard(s);
    expect(s.draft).toEqual(DEFAULT_BUNDLE_CONFIG); // discard → reset baseline
  });

  it("E — Reset → Publish makes DEFAULT live", () => {
    let s = init(withHeading("LIVE"));
    s = afterReset(s);
    expect(s.published?.hero.heading).toBe("LIVE"); // not yet
    s = afterPublish(s);
    expect(s.published).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(publicationLabel(s)).toBe("Published — live");
  });

  it("F — Publish → edit again: dirty + 'Draft changes not published'", () => {
    let s = afterPublish(afterEdit(init(), withHeading("V1")));
    expect(publicationLabel(s)).toBe("Published — live");
    s = afterEdit(s, withHeading("V2-local"));
    expect(isDirty(s)).toBe(true); // local edit not live
    s = afterSave(s);
    expect(isDirty(s)).toBe(false);
    expect(publicationLabel(s)).toBe("Draft changes not published"); // saved ≠ published
  });

  it("G — Restore-to-draft → edit → Discard restores the restored draft", () => {
    let s = init(withHeading("LIVE"));
    s = afterRestoreToDraft(s, withHeading("REV"));
    expect(s.draft.hero.heading).toBe("REV");
    expect(s.published?.hero.heading).toBe("LIVE"); // live unchanged
    s = afterEdit(s, withHeading("tweak"));
    s = afterDiscard(s);
    expect(s.draft.hero.heading).toBe("REV");
  });

  it("H — Restore+Publish synchronizes published + baseline", () => {
    let s = init(withHeading("LIVE"));
    s = afterRestorePublish(s, withHeading("REV2"));
    expect(s.published?.hero.heading).toBe("REV2");
    expect(s.saved.hero.heading).toBe("REV2");
    expect(isDirty(s)).toBe(false);
    expect(publicationLabel(s)).toBe("Published — live");
  });

  it("beforeunload driver: dirty only for genuine unsaved edits; cleared after save/publish/discard", () => {
    let s = init();
    expect(isDirty(s)).toBe(false); // nothing changed → no false warning
    s = afterEdit(s, withHeading("edit"));
    expect(isDirty(s)).toBe(true);
    expect(isDirty(afterSave(s))).toBe(false);
    expect(isDirty(afterDiscard(s))).toBe(false);
    expect(isDirty(afterPublish(s))).toBe(false);
  });
});
