import { describe, it, expect } from "vitest";
import { normalizeEvents } from "./sectionAnalyticsService";

describe("sectionAnalyticsService.normalizeEvents (Phase 6 · point 26)", () => {
  it("keeps valid events, defaults page_key, clamps scroll, nulls scroll for non-scroll", () => {
    const rows = normalizeEvents([
      { sectionId: "s1", eventType: "view", sessionId: "sess" },
      { sectionId: "s1", eventType: "scroll", scrollPct: 140 }, // clamps to 100
      { sectionId: "s2", eventType: "scroll", scrollPct: -5 },  // clamps to 0
      { sectionId: "s3", eventType: "click", scrollPct: 50 },   // scroll ignored for non-scroll
      { pageKey: "about", sectionId: "s4", eventType: "conversion" },
    ]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ page_key: "homepage", section_id: "s1", event_type: "view", scroll_pct: null });
    expect(rows[1].scroll_pct).toBe(100);
    expect(rows[2].scroll_pct).toBe(0);
    expect(rows[3].scroll_pct).toBe(null);
    expect(rows[4]).toMatchObject({ page_key: "about", event_type: "conversion" });
  });

  it("drops invalid events (bad type, missing section id, non-array)", () => {
    expect(normalizeEvents([
      { sectionId: "", eventType: "view" },
      { sectionId: "s1", eventType: "hover" as unknown as "view" },
      { eventType: "view" } as unknown as { sectionId: string; eventType: "view" },
    ])).toHaveLength(0);
    expect(normalizeEvents(null as unknown as [])).toHaveLength(0);
  });

  it("caps a flood at 50 rows", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ sectionId: `s${i}`, eventType: "view" as const }));
    expect(normalizeEvents(many)).toHaveLength(50);
  });
});
