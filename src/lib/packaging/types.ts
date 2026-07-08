/**
 * Packaging Engine types (STRUCTURE). Mirrors the packaging_* tables. The engine is
 * pure logic; real measurements are DATA entered later. Knows nothing about couriers
 * — it only produces a PackedParcel that the Shipping Engine consumes.
 */
export type PackagingAssetType =
  | "outer_box"
  | "rigid_box"
  | "mailer"
  | "pouch"
  | "gift_box"
  | "insert"
  | "tissue"
  | "foam"
  | "filler"
  | "wrap"
  | "tape"
  | "leak_seal";

export interface PackagingAsset {
  id: string;
  name: string;
  type: PackagingAssetType;
  lengthCm?: number; // outer dims (boxes)
  widthCm?: number;
  heightCm?: number;
  weightG: number; // the asset's own weight
  maxWeightG?: number;
  maxProducts?: number;
  fragile?: boolean;
  costInr?: number;
  vendor?: string;
  barcode?: string;
  active: boolean;
  // §3 inventory (optional — defaults handled by the inventory helpers)
  currentStock?: number;
  minStock?: number;
  reorderLevel?: number;
  purchaseCostInr?: number;
}

export type ProfileItemRole = "box" | "insert" | "filler" | "wrap" | "seal";
export interface PackagingProfileItem {
  assetId: string;
  quantity: number;
  role: ProfileItemRole;
}
export interface PackagingProfile {
  id: string;
  name: string;
  description?: string;
  items: PackagingProfileItem[];
  active: boolean;
}

export type PackagingRuleKind = "select" | "modifier";
export interface PackagingRule {
  id: string;
  name: string;
  kind: PackagingRuleKind;
  priority: number;
  active: boolean;
  // conditions (undefined = any)
  minProducts?: number;
  maxProducts?: number;
  productType?: string;
  vessel?: string;
  isGift?: boolean;
  // actions
  profileId?: string; // kind = select
  addFragileWrap?: boolean; // kind = modifier
  addLeakSeal?: boolean; // kind = modifier
}

/** What the engine needs to know about an order to pack it. */
export interface PackContext {
  productCount: number; // total quantity of items
  productTypes: string[]; // distinct product types present (candle, room_spray…)
  vessels: string[]; // distinct vessels present (glass, ceramic…)
  isGift: boolean;
  netWeightsG: number[]; // per-unit net product weights (wax + jar + lid + label)
}

export interface PackagingCatalog {
  assets: PackagingAsset[];
  profiles: PackagingProfile[];
  rules: PackagingRule[];
  defaultProfileId: string;
}

/** The engine's output — every weight kept separate, never overwritten. */
export interface PackedParcel {
  profileId: string;
  profileName: string;
  netWeightKg: number;
  packagingWeightKg: number;
  shippingWeightKg: number; // net + packaging
  dimensions: { lengthCm: number; widthCm: number; heightCm: number };
  volumetricWeightKg: number;
  chargeableWeightKg: number; // max(shipping, volumetric)
  addFragileWrap: boolean;
  addLeakSeal: boolean;
  estimatedPackagingCostInr: number;
}
