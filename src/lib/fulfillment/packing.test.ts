import { describe, it, expect } from "vitest";
import { requiredPackingItems, packingComplete, packingProgress, PACKING_ITEMS } from "@/lib/fulfillment/packing";

const allDone = (isGift: boolean) => Object.fromEntries(requiredPackingItems(isGift).map((i) => [i.key, { done: true }]));

describe("packing checklist", () => {
  it("Gift Box is required only for gift orders", () => {
    expect(requiredPackingItems(false).some((i) => i.key === "gift_box")).toBe(false);
    expect(requiredPackingItems(true).some((i) => i.key === "gift_box")).toBe(true);
    // the brand collateral is always required
    for (const k of ["story_card", "care_card", "thank_you_card", "dust_bag"]) {
      expect(requiredPackingItems(false).some((i) => i.key === k)).toBe(true);
    }
  });

  it("is incomplete by default ({}), complete only when every required item is checked", () => {
    expect(packingComplete({}, false)).toBe(false);
    expect(packingComplete(null, false)).toBe(false);
    expect(packingComplete(allDone(false), false)).toBe(true);
    expect(packingComplete(allDone(true), true)).toBe(true);
  });

  it("a non-gift order that has everything EXCEPT gift_box is complete; a gift order is not", () => {
    const nonGiftSet = allDone(false); // no gift_box
    expect(packingComplete(nonGiftSet, false)).toBe(true);
    expect(packingComplete(nonGiftSet, true)).toBe(false); // gift order still needs the gift box
  });

  it("missing the Story Card blocks completion (the brand gate)", () => {
    const set = { ...allDone(false) };
    delete (set as Record<string, unknown>).story_card;
    expect(packingComplete(set, false)).toBe(false);
  });

  it("reports done/total progress", () => {
    expect(packingProgress({}, false)).toMatchObject({ done: 0, complete: false });
    expect(packingProgress(allDone(false), false)).toMatchObject({ complete: true });
    expect(packingProgress(allDone(false), false).total).toBe(PACKING_ITEMS.filter((i) => !i.giftOnly).length);
  });
});
