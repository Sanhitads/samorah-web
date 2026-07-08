/**
 * Packaging inventory (§3) — packaging is stock too. These helpers flag when an
 * asset (bubble wrap, boxes…) is low or needs reordering, so dispatch never stalls
 * on an empty shelf. Pure over PackagingAsset.
 */
import type { PackagingAsset } from "./types";

export function isLowStock(a: Pick<PackagingAsset, "currentStock" | "minStock">): boolean {
  return (a.currentStock ?? 0) <= (a.minStock ?? 0);
}

export function needsReorder(a: Pick<PackagingAsset, "currentStock" | "reorderLevel">): boolean {
  return (a.currentStock ?? 0) <= (a.reorderLevel ?? 0);
}

/** Suggested reorder quantity to reach `target` stock. */
export function reorderQty(a: Pick<PackagingAsset, "currentStock">, target: number): number {
  return Math.max(0, target - (a.currentStock ?? 0));
}

/** Assets that need reordering, most urgent (lowest cover) first. */
export function assetsNeedingReorder(assets: PackagingAsset[]): PackagingAsset[] {
  return assets
    .filter((a) => a.active && needsReorder(a))
    .sort((a, b) => (a.currentStock ?? 0) - (b.currentStock ?? 0));
}
