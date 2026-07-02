import { createPublicClient } from "@/lib/supabase/public";
import { defaultVariant, primaryImage, type VariantLike, type ImageLike } from "@/lib/product";
import { effectivePrice } from "@/lib/pricing";
import type { BundleCandle } from "@/lib/bundle";

// Product + its active variants + primary image — everything the bundle picker
// needs to show a candle and, on select, add its default variant to the cart.
const BUNDLE_FIELDS =
  "id, slug, name, tagline, fragrance_family, product_images(url, alt_text, is_primary, sort_order), variants(id, vessel_type, size_label, price, sale_price, stock, low_stock_threshold, is_active, sort_order)";

const GRADIENT = "gradient:grad-chai";

interface BundleRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  fragrance_family: string | null;
  product_images: ImageLike[] | null;
  variants: (VariantLike & { price: number; sale_price: number | null })[] | null;
}

/**
 * Active candles eligible for the bundle, as lean `BundleCandle` view-models.
 * A product with no sellable variant is skipped (nothing to add to the cart).
 * Air products aren't in the DB, so this returns only real candle products.
 */
export async function getBundleCandles(): Promise<BundleCandle[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("products")
    .select(BUNDLE_FIELDS)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as BundleRow[])
    .map((p): BundleCandle | null => {
      const variants = (p.variants ?? []).filter((v) => v.is_active);
      const def = defaultVariant(variants);
      if (!def) return null; // no sellable variant → not bundle-eligible
      const img = primaryImage(p.product_images);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        family: p.fragrance_family,
        image: { url: img?.url ?? GRADIENT, alt: img?.alt_text ?? p.name },
        basePrice: effectivePrice(def),
        vessel: def.vessel_type ?? "",
        size: def.size_label ?? "",
        inStock: def.stock > 0,
      };
    })
    .filter((c): c is BundleCandle => c !== null);
}
