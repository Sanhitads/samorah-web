import { describe, it, expect } from "vitest";
import { clampPicked, pickProgress } from "@/lib/fulfillment/pick";

describe("pick progress", () => {
  it("clamps a requested pick to [0, quantity], whole numbers", () => {
    expect(clampPicked(2, 4)).toBe(2);
    expect(clampPicked(9, 4)).toBe(4); // can't pick more than ordered
    expect(clampPicked(-1, 4)).toBe(0);
    expect(clampPicked(2.7, 4)).toBe(2); // floored
    expect(clampPicked(NaN, 4)).toBe(0);
  });

  it("sums progress across lines and flags completeness", () => {
    expect(pickProgress([{ pickedQty: 1, quantity: 1 }, { pickedQty: 1, quantity: 2 }])).toEqual({ picked: 2, total: 3, complete: false });
    expect(pickProgress([{ pickedQty: 1, quantity: 1 }, { pickedQty: 2, quantity: 2 }])).toEqual({ picked: 3, total: 3, complete: true });
  });

  it("never counts an over-picked line beyond its quantity", () => {
    expect(pickProgress([{ pickedQty: 9, quantity: 2 }])).toEqual({ picked: 2, total: 2, complete: true });
  });

  it("an empty order is not 'complete' (nothing to pick)", () => {
    expect(pickProgress([])).toEqual({ picked: 0, total: 0, complete: false });
  });
});
