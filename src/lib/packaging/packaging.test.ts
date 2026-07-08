import { describe, it, expect } from "vitest";
import { selectPackaging, computeParcel, packOrder } from "@/lib/packaging/engine";
import { EXAMPLE_PACKAGING_CATALOG as CAT } from "@/config/packaging";
import type { PackContext } from "@/lib/packaging/types";

const ctx = (o: Partial<PackContext>): PackContext => ({
  productCount: 1,
  productTypes: ["candle"],
  vessels: ["glass"],
  isGift: false,
  netWeightsG: [300],
  ...o,
});

describe("packaging engine — rules select the profile", () => {
  it("1 candle → Single Candle profile", () => {
    expect(selectPackaging(ctx({}), CAT)?.profile.id).toBe("prof-single");
  });
  it("3 candles → Discovery Composition box", () => {
    const sel = selectPackaging(ctx({ productCount: 3, netWeightsG: [300, 300, 300] }), CAT);
    expect(sel?.profile.id).toBe("prof-comp");
  });
  it("gift order → Gift Box (highest-priority selector wins)", () => {
    const sel = selectPackaging(ctx({ productCount: 3, isGift: true }), CAT);
    expect(sel?.profile.id).toBe("prof-gift");
  });
});

describe("packaging engine — modifiers stack independently of the profile", () => {
  it("ceramic adds fragile wrap; room spray adds leak seal", () => {
    const sel = selectPackaging(ctx({ vessels: ["ceramic"], productTypes: ["candle", "room_spray"] }), CAT);
    expect(sel?.addFragileWrap).toBe(true);
    expect(sel?.addLeakSeal).toBe(true);
  });
  it("glass candle → no modifiers", () => {
    const sel = selectPackaging(ctx({}), CAT);
    expect(sel?.addFragileWrap).toBe(false);
    expect(sel?.addLeakSeal).toBe(false);
  });
});

describe("packaging engine — weight pipeline (nothing overwritten)", () => {
  it("computes net, packaging, shipping, volumetric, chargeable + dims", () => {
    const context = ctx({ productCount: 3, netWeightsG: [300, 300, 300] });
    const parcel = packOrder(context, CAT)!;
    expect(parcel.profileName).toBe("Discovery Composition");
    // net 900g; packaging = box 180 + tissue 5×3 + filler 20×2 = 235g
    expect(parcel.netWeightKg).toBeCloseTo(0.9, 5);
    expect(parcel.packagingWeightKg).toBeCloseTo(0.235, 5);
    expect(parcel.shippingWeightKg).toBeCloseTo(1.135, 5);
    // box 26×26×12 = 8112 cm³ / 5000 = 1.6224 kg → volumetric wins
    expect(parcel.dimensions).toEqual({ lengthCm: 26, widthCm: 26, heightCm: 12 });
    expect(parcel.volumetricWeightKg).toBeCloseTo(1.6224, 4);
    expect(parcel.chargeableWeightKg).toBeCloseTo(1.6224, 4);
    expect(parcel.estimatedPackagingCostInr).toBeGreaterThan(0);
  });

  it("falls back to the default profile when no selector matches", () => {
    const parcel = computeParcel(ctx({ productCount: 0 }), { profile: CAT.profiles[0], addFragileWrap: false, addLeakSeal: false }, CAT);
    expect(parcel.profileId).toBe("prof-single");
  });
});
