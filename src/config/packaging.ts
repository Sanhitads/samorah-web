/**
 * Example packaging catalog — PLACEHOLDER structure so the engine is demonstrable
 * and testable today. Every weight/dimension/cost here is a guess.
 *
 * TODO(real-data): replace with measured values (weigh each box, measure L×W×H,
 * record per-variant net weights) via the packaging_* tables + admin UI. When that
 * data exists, the Shipping Engine switches from config/logistics DEFAULT_PARCEL to
 * `packOrder(context, catalog)` — a data change, not a code change.
 */
import type { PackagingCatalog } from "@/lib/packaging/types";

export const EXAMPLE_PACKAGING_CATALOG: PackagingCatalog = {
  defaultProfileId: "prof-single",
  assets: [
    { id: "box-s", name: "Single Candle Box", type: "outer_box", lengthCm: 12, widthCm: 12, heightCm: 12, weightG: 80, maxWeightG: 800, maxProducts: 1, costInr: 18, active: true },
    { id: "box-m", name: "Two Candle Box", type: "outer_box", lengthCm: 24, widthCm: 12, heightCm: 12, weightG: 130, maxWeightG: 1600, maxProducts: 2, costInr: 26, active: true },
    { id: "box-comp", name: "Composition Box", type: "outer_box", lengthCm: 26, widthCm: 26, heightCm: 12, weightG: 180, maxWeightG: 2400, maxProducts: 3, costInr: 34, active: true },
    { id: "gift-box", name: "Rigid Gift Box", type: "gift_box", lengthCm: 28, widthCm: 28, heightCm: 14, weightG: 260, maxProducts: 3, costInr: 120, active: true },
    { id: "bubble", name: "Bubble Wrap Sheet", type: "wrap", weightG: 15, costInr: 4, fragile: true, active: true },
    { id: "tissue", name: "Tissue Sheet", type: "tissue", weightG: 5, costInr: 2, active: true },
    { id: "filler", name: "Kraft Filler", type: "filler", weightG: 20, costInr: 3, active: true },
    { id: "leak", name: "Leak-Seal Bag", type: "leak_seal", weightG: 6, costInr: 3, active: true },
  ],
  profiles: [
    { id: "prof-single", name: "Single Candle", active: true, items: [{ assetId: "box-s", quantity: 1, role: "box" }, { assetId: "tissue", quantity: 1, role: "wrap" }, { assetId: "filler", quantity: 1, role: "filler" }] },
    { id: "prof-double", name: "Two Candles", active: true, items: [{ assetId: "box-m", quantity: 1, role: "box" }, { assetId: "tissue", quantity: 2, role: "wrap" }, { assetId: "filler", quantity: 1, role: "filler" }] },
    { id: "prof-comp", name: "Discovery Composition", active: true, items: [{ assetId: "box-comp", quantity: 1, role: "box" }, { assetId: "tissue", quantity: 3, role: "wrap" }, { assetId: "filler", quantity: 2, role: "filler" }] },
    { id: "prof-gift", name: "Gift Box", active: true, items: [{ assetId: "gift-box", quantity: 1, role: "box" }, { assetId: "tissue", quantity: 3, role: "wrap" }] },
  ],
  rules: [
    // modifiers (low priority numbers evaluated first; all matches apply)
    { id: "r-ceramic", name: "Ceramic → fragile wrap", kind: "modifier", priority: 5, vessel: "ceramic", addFragileWrap: true, active: true },
    { id: "r-spray", name: "Room/Linen spray → leak seal", kind: "modifier", priority: 6, productType: "room_spray", addLeakSeal: true, active: true },
    // selectors (first match wins)
    { id: "r-gift", name: "Gift order → Gift Box", kind: "select", priority: 10, isGift: true, profileId: "prof-gift", active: true },
    { id: "r-comp", name: "3 candles → Composition Box", kind: "select", priority: 20, minProducts: 3, maxProducts: 3, profileId: "prof-comp", active: true },
    { id: "r-two", name: "2 products → Two Box", kind: "select", priority: 30, minProducts: 2, maxProducts: 2, profileId: "prof-double", active: true },
    { id: "r-single", name: "1 product → Single Box", kind: "select", priority: 40, minProducts: 1, maxProducts: 1, profileId: "prof-single", active: true },
  ],
};
