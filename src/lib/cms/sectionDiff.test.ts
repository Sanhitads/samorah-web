import { describe, it, expect } from "vitest";
import { diffSections, summarizeChanges } from "./sectionDiff";

const sec = (id: string, type: string, settings: Record<string, unknown> = {}, enabled = true) => ({ id, type, enabled, settings });

describe("diffSections (Phase 8 · point 35)", () => {
  it("detects added and removed sections", () => {
    const a = [sec("h", "hero"), sec("w", "words")];
    const b = [sec("h", "hero"), sec("c", "content-blocks")];
    const d = diffSections(a, b);
    expect(d.find((x) => x.sectionId === "c")?.kind).toBe("added");
    expect(d.find((x) => x.sectionId === "w")?.kind).toBe("removed");
  });

  it("reports changed fields with previous → new values (and ignores __mgmt keys)", () => {
    const a = [sec("h", "hero", { heading: "Old", sub: "same", __state: "published" })];
    const b = [sec("h", "hero", { heading: "New", sub: "same", __state: "hidden" })];
    const d = diffSections(a, b);
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe("changed");
    expect(d[0].fields).toEqual([{ field: "heading", prev: "Old", next: "New" }]); // sub unchanged, __state ignored
  });

  it("detects an enabled/disabled toggle", () => {
    const d = diffSections([sec("h", "hero", {}, true)], [sec("h", "hero", {}, false)]);
    expect(d[0].fields).toEqual([{ field: "enabled", prev: true, next: false }]);
  });

  it("no changes → empty diff", () => {
    const a = [sec("h", "hero", { heading: "X" })];
    expect(diffSections(a, a)).toEqual([]);
    expect(diffSections([], [])).toEqual([]);
  });

  it("summarizeChanges reads in plain language", () => {
    const changes = diffSections([sec("h", "hero", { heading: "A" }), sec("w", "words")], [sec("h", "hero", { heading: "B" }), sec("c", "content-blocks")]);
    const s = summarizeChanges(changes, (t) => ({ hero: "Hero", words: "Words", "content-blocks": "Editorial" }[t] ?? t));
    expect(s).toContain("Edited Hero (heading)");
    expect(s).toContain("Removed Words");
    expect(s).toContain("Added Editorial");
  });
});
