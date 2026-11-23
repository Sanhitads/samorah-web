"use client";

import { ProductGallery } from "@/components/product/ProductGallery";
import { usePdpVariant } from "@/components/product/PdpVariantContext";
import { galleryForVariant, type ProductGalleryImage } from "@/lib/productPage";

/**
 * Variant-aware wrapper around ProductGallery. Reads the selected variant from PdpVariantContext and
 * shows that vessel+size's photos when it has its own; otherwise the shared/default gallery. Keeps
 * ProductGallery itself unaware of variants, so other callers (the Air PDP) are unaffected.
 */
export function PdpGalleryIsland({
  gallery,
  galleriesByVariant,
  name,
  itemId,
}: {
  gallery: ProductGalleryImage[];
  galleriesByVariant: Record<string, ProductGalleryImage[]>;
  name: string;
  itemId?: string;
}) {
  const { selectedVariantId } = usePdpVariant();
  const images = galleryForVariant(selectedVariantId, galleriesByVariant, gallery);
  // Key the gallery by which set is showing so it resets to the first image when the set swaps.
  const hasOwn = images !== gallery;
  const galleryKey = hasOwn && selectedVariantId ? selectedVariantId : "default";
  return <ProductGallery images={images} galleryKey={galleryKey} name={name} itemId={itemId} />;
}
