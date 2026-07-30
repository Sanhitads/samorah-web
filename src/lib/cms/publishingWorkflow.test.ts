import { describe, it, expect } from "vitest";
import { effectiveSectionState, sectionScheduleOk } from "@/lib/cms/sectionState";
import { mergePublishedSections } from "@/services/pageComposerService";
import type { ComposedSection } from "@/services/pageComposerService";

/**
 * Phase 3 publishing workflow — pins the two pure cores: the displayed effective state (point 12) and
 * the selective-publish merge (point 13). Scheduling (point 14) is covered by sectionScheduleOk here too.
 */
const T2099 = "2099-01-01T00:00"; // far future
const T2000 = "2000-01-01T00:00"; // far past

describe("effectiveSectionState (point 12)", () => {
  it("hidden / archived read straight through", () => {
    expect(effectiveSectionState({ __state: "hidden" })).toBe("hidden");
    expect(effectiveSectionState({ __state: "archived" })).toBe("archived");
  });
  it("scheduled before its window ⇒ Scheduled; after its end ⇒ Expired", () => {
    expect(effectiveSectionState({ __state: "scheduled", __from: T2099 })).toBe("scheduled");
    expect(effectiveSectionState({ __state: "scheduled", __from: T2000, __until: T2000 })).toBe("expired");
  });
  it("scheduled within its window is treated as live (Published/Draft by publish status)", () => {
    expect(effectiveSectionState({ __state: "scheduled", __from: T2000, __until: T2099 }, { publishStatus: "published" })).toBe("published");
    expect(effectiveSectionState({ __state: "scheduled", __from: T2000, __until: T2099 }, { publishStatus: "new" })).toBe("draft");
  });
  it("a visible section is Published only when live-in-sync and not dirty", () => {
    expect(effectiveSectionState({}, { publishStatus: "published", dirty: false })).toBe("published");
    expect(effectiveSectionState({}, { publishStatus: "published", dirty: true })).toBe("draft");   // pending edits
    expect(effectiveSectionState({}, { publishStatus: "changed" })).toBe("draft");                  // published, then edited+saved
    expect(effectiveSectionState({}, { publishStatus: "new" })).toBe("draft");                      // never published
  });
});

describe("sectionScheduleOk (point 14)", () => {
  it("gates a future publish and a past unpublish", () => {
    expect(sectionScheduleOk({ __state: "scheduled", __from: T2099 })).toBe(false); // not published yet
    expect(sectionScheduleOk({ __state: "scheduled", __until: T2000 })).toBe(false); // already unpublished
    expect(sectionScheduleOk({ __state: "scheduled", __from: T2000, __until: T2099 })).toBe(true); // live
    expect(sectionScheduleOk({})).toBe(true); // non-scheduled always ok
  });
});

const sec = (id: string, extra: Partial<ComposedSection> = {}): ComposedSection => ({ id, type: id, enabled: true, sortOrder: 0, settings: { v: 1 }, ...extra });

describe("mergePublishedSections (point 13 — publish only selected, self-healing)", () => {
  it("selected sections take draft content; unselected keep their previous published content", () => {
    const draft = [sec("hero", { settings: { v: "draft-hero" } }), sec("testi", { settings: { v: "draft-testi" } })];
    const prev = [sec("hero", { settings: { v: "live-hero" } }), sec("testi", { settings: { v: "live-testi" } })];
    const out = mergePublishedSections(draft, prev, ["hero"]);
    expect(out.find((s) => s.id === "hero")!.settings).toEqual({ v: "draft-hero" }); // published
    expect(out.find((s) => s.id === "testi")!.settings).toEqual({ v: "live-testi" }); // untouched live
  });
  it("SELF-HEAL: an unselected section missing from live is NOT dropped — it reappears with default content", () => {
    const draft = [sec("hero", { settings: { v: "wip-hero" } }), sec("words", { settings: { v: "wip-words" } })];
    const prev = [sec("hero", { settings: { v: "live-hero" } })]; // words is MISSING from live (broken state)
    const out = mergePublishedSections(draft, prev, ["hero"]);
    expect(out.map((s) => s.id)).toEqual(["hero", "words"]); // words is healed back, not vanished
    expect(out.find((s) => s.id === "words")!.settings).toEqual({}); // default content (edits not leaked)
  });
  it("SELF-HEAL from a completely empty live version keeps every draft section", () => {
    const draft = [sec("hero"), sec("words"), sec("testi")];
    const out = mergePublishedSections(draft, [], ["testi"]);
    expect(out.map((s) => s.id)).toEqual(["hero", "words", "testi"]); // nothing vanishes
  });
  it("healing respects a section's enabled/scheduling state (won't force a hidden section visible)", () => {
    const draft = [sec("hero"), sec("promo", { enabled: false, settings: { v: "x", __state: "hidden" } })];
    const out = mergePublishedSections(draft, [], ["hero"]);
    const promo = out.find((s) => s.id === "promo")!;
    expect(promo.enabled).toBe(false);                 // stays hidden
    expect(promo.settings).toEqual({ __state: "hidden" }); // keeps its state, content stripped
  });
  it("published order follows the draft, sortOrder renumbered", () => {
    const draft = [sec("b"), sec("a"), sec("c")];
    const prev = [sec("a"), sec("b"), sec("c")];
    const out = mergePublishedSections(draft, prev, ["a", "b", "c"]);
    expect(out.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(out.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });
});
