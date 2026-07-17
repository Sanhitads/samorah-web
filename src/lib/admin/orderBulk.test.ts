import { describe, it, expect } from "vitest";
import { parseTags, mergeTags, removeTagsFrom, validateBulk, bulkConfirmText, REVERSIBLE, MAX_TAGS } from "@/lib/admin/orderBulk";

describe("bulk operation logic (Phase 1 — safe, non-destructive)", () => {
  it("parseTags cleans, splits, de-dupes", () => {
    expect(parseTags("VIP, Fragile ,VIP,, Express")).toEqual(["VIP", "Fragile", "Express"]);
    expect(parseTags("  ")).toEqual([]);
  });

  it("mergeTags unions without duplicates and caps length", () => {
    expect(mergeTags(["A", "B"], ["B", "C"])).toEqual(["A", "B", "C"]);
    const many = Array.from({ length: 30 }, (_, i) => `T${i}`);
    expect(mergeTags([], many)).toHaveLength(MAX_TAGS);
  });

  it("removeTagsFrom drops only the named tags", () => {
    expect(removeTagsFrom(["A", "B", "C"], ["B"])).toEqual(["A", "C"]);
    expect(removeTagsFrom(["A"], ["X"])).toEqual(["A"]);
  });

  it("validates each action's required params", () => {
    expect(validateBulk({ action: "assign", staffId: "u1" }).ok).toBe(true);
    expect(validateBulk({ action: "assign" }).ok).toBe(false);
    expect(validateBulk({ action: "priority", priority: "vip" }).ok).toBe(true);
    expect(validateBulk({ action: "priority", priority: "nope" }).ok).toBe(false);
    expect(validateBulk({ action: "addTags", tags: ["A"] }).ok).toBe(true);
    expect(validateBulk({ action: "addTags", tags: [] }).ok).toBe(false);
    expect(validateBulk({ action: "note", note: "hi" }).ok).toBe(true);
    expect(validateBulk({ action: "note", note: "   " }).ok).toBe(false);
  });

  it("only column-changing actions are reversible (note is not)", () => {
    expect(REVERSIBLE).toContain("assign");
    expect(REVERSIBLE).toContain("addTags");
    expect(REVERSIBLE).not.toContain("note");
  });

  it("confirm text names the count + detail", () => {
    expect(bulkConfirmText("assign", 3, "Asha")).toBe("Assign 3 orders to Asha?");
    expect(bulkConfirmText("priority", 1, "VIP")).toBe("Set priority of 1 order to VIP?");
    expect(bulkConfirmText("removeTags", 5, "Fragile")).toBe("Remove tag(s) “Fragile” from 5 orders?");
  });
});
