import { createPublicClient } from "@/lib/supabase/public";
import { primaryImage, type VariantLike, type ImageLike } from "@/lib/product";
import { effectivePrice } from "@/lib/pricing";
import { BUNDLE_SIZE_LABEL, CHAPTER_META, type BundleCandle, type BundleChapter } from "@/lib/bundle";

// Product + its collection (chapter) + variants — everything the composer needs
// to show a candle, filter by vessel/chapter, and add the right 100g variant.
const BUNDLE_FIELDS =
  "id, slug, name, tagline, collection:collections!products_collection_id_fkey(slug, name, volume), product_images(url, alt_text, is_primary, sort_order), variants(id, vessel_type, size_label, price, sale_price, stock, low_stock_threshold, is_active, sort_order)";

const GRADIENT = "gradient:grad-chai";

interface BundleRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  collection: { slug: string; name: string; volume: string | null } | null;
  product_images: ImageLike[] | null;
  variants: (VariantLike & { price: number; sale_price: number | null })[] | null;
}

function toChapter(c: BundleRow["collection"]): BundleChapter | null {
  if (!c) return null;
  const meta = CHAPTER_META[c.slug] ?? { key: c.slug, short: c.name, order: 99 };
  return { slug: c.slug, key: meta.key, short: meta.short, order: meta.order, volume: c.volume, name: c.name };
}

/**
 * Active candles eligible for the Discovery Composition — each carries its 100g
 * variant options per vessel (glass/ceramic/…). A candle with no 100g variant
 * is skipped. Air products aren't in the DB, so this is candles only.
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
      const options = (p.variants ?? [])
        .filter((v) => v.is_active && v.size_label === BUNDLE_SIZE_LABEL && v.vessel_type)
        .map((v) => ({
          vessel: v.vessel_type as string,
          variantId: v.id,
          size: v.size_label as string,
          price: effectivePrice(v),
          inStock: v.stock > 0,
        }));
      if (options.length === 0) return null; // no 100g variant → not eligible
      const img = primaryImage(p.product_images);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        chapter: toChapter(p.collection),
        image: { url: img?.url ?? GRADIENT, alt: img?.alt_text ?? p.name },
        vessels: options,
      };
    })
    .filter((c): c is BundleCandle => c !== null);
}
