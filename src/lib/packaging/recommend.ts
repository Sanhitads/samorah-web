/**
 * Packaging recommendation (§6) — the engine recommends a parcel; a human confirms
 * before the shipment is created (shipments.packaging_confirmed). Keeps automation
 * assistive, not blind. Thin wrapper over the pure engine.
 */
import { packOrder } from "./engine";
import type { PackContext, PackagingCatalog, PackedParcel } from "./types";

export interface PackagingRecommendation {
  parcel: PackedParcel;
  /** True until a packer confirms — the shipment should not dispatch unconfirmed. */
  requiresConfirmation: boolean;
}

export function recommendPackaging(ctx: PackContext, catalog: PackagingCatalog): PackagingRecommendation | null {
  const parcel = packOrder(ctx, catalog);
  if (!parcel) return null;
  return { parcel, requiresConfirmation: true };
}
