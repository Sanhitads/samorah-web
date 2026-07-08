/**
 * Packaging Engine (pure). Two steps:
 *   1. selectPackaging — evaluate Samorah's rules → chosen profile + handling flags.
 *      `select` rules pick the profile (first match by priority); ALL matching
 *      `modifier` rules apply (ceramic → fragile wrap, spray → leak-seal).
 *   2. computeParcel — from the profile's assets + product net weights, derive the
 *      weight pipeline + external dimensions. Volumetric and chargeable weights are
 *      computed here, never overwriting the actual weights.
 *
 * No DB, no courier — pure functions over a PackagingCatalog. Real numbers are data.
 */
import { volumetricWeightKg } from "@/config/logistics";
import type { PackContext, PackagingCatalog, PackagingProfile, PackagingRule, PackedParcel } from "./types";

function ruleMatches(r: PackagingRule, ctx: PackContext): boolean {
  if (!r.active) return false;
  if (r.minProducts != null && ctx.productCount < r.minProducts) return false;
  if (r.maxProducts != null && ctx.productCount > r.maxProducts) return false;
  if (r.productType && !ctx.productTypes.includes(r.productType)) return false;
  if (r.vessel && !ctx.vessels.includes(r.vessel)) return false;
  if (r.isGift != null && r.isGift !== ctx.isGift) return false;
  return true;
}

export interface PackagingSelection {
  profile: PackagingProfile;
  matchedSelectRuleId?: string;
  addFragileWrap: boolean;
  addLeakSeal: boolean;
}

export function selectPackaging(ctx: PackContext, catalog: PackagingCatalog): PackagingSelection | null {
  const byPriority = [...catalog.rules].sort((a, b) => a.priority - b.priority);

  // 1) first matching SELECT rule picks the profile (else the default profile)
  const selectRule = byPriority.find((r) => r.kind === "select" && r.profileId && ruleMatches(r, ctx));
  const profileId = selectRule?.profileId ?? catalog.defaultProfileId;
  const profile = catalog.profiles.find((p) => p.id === profileId && p.active);
  if (!profile) return null;

  // 2) ALL matching MODIFIER rules apply
  const modifiers = byPriority.filter((r) => r.kind === "modifier" && ruleMatches(r, ctx));
  return {
    profile,
    matchedSelectRuleId: selectRule?.id,
    addFragileWrap: modifiers.some((m) => m.addFragileWrap),
    addLeakSeal: modifiers.some((m) => m.addLeakSeal),
  };
}

export function computeParcel(ctx: PackContext, selection: PackagingSelection, catalog: PackagingCatalog): PackedParcel {
  const { profile } = selection;
  const resolved = profile.items
    .map((pi) => ({ pi, asset: catalog.assets.find((a) => a.id === pi.assetId) }))
    .filter((x): x is { pi: (typeof profile.items)[number]; asset: NonNullable<typeof x.asset> } => Boolean(x.asset));

  const netG = ctx.netWeightsG.reduce((s, w) => s + w, 0);
  const packagingG = resolved.reduce((s, x) => s + x.asset.weightG * x.pi.quantity, 0);
  const costInr = resolved.reduce((s, x) => s + (x.asset.costInr ?? 0) * x.pi.quantity, 0);

  const box = resolved.find((x) => x.pi.role === "box")?.asset;
  const dimensions = {
    lengthCm: box?.lengthCm ?? 0,
    widthCm: box?.widthCm ?? 0,
    heightCm: box?.heightCm ?? 0,
  };

  const shippingWeightKg = (netG + packagingG) / 1000;
  const volKg = volumetricWeightKg(dimensions);
  return {
    profileId: profile.id,
    profileName: profile.name,
    netWeightKg: netG / 1000,
    packagingWeightKg: packagingG / 1000,
    shippingWeightKg,
    dimensions,
    volumetricWeightKg: volKg,
    chargeableWeightKg: Math.max(shippingWeightKg, volKg),
    addFragileWrap: selection.addFragileWrap,
    addLeakSeal: selection.addLeakSeal,
    estimatedPackagingCostInr: costInr,
  };
}

/** Convenience: select + compute in one call. Returns null if no usable profile. */
export function packOrder(ctx: PackContext, catalog: PackagingCatalog): PackedParcel | null {
  const selection = selectPackaging(ctx, catalog);
  return selection ? computeParcel(ctx, selection, catalog) : null;
}
