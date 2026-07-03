import { getShopProducts } from "@/services/productService";
import { getEditionMap, type ProductEdition } from "@/services/collectionService";
import { getAirVolumes, airEditionOf, airProductType } from "@/config/theHours";
import type { ShopProductInput } from "@/lib/shopPage";

/**
 * The full shop catalogue — every published product across types. Candles come
 * from the DB; Room/Linen Sprays (the Air "Hours") come from config until they
 * have DB rows. Both are normalised to ShopProductInput + a shared edition map,
 * so the Shop is type-driven (never hard-coded to candles) and future product
 * types slot in by adding rows/config.
 */
export async function getShopCatalog(): Promise<{
  products: ShopProductInput[];
  editions: Map<string, ProductEdition>;
}> {
  const [candles, editions] = await Promise.all([getShopProducts(), getEditionMap()]);

  const candleEntries = (candles as unknown as ShopProductInput[]).map((c) => ({
    ...c,
    product_type: "candle" as const,
  }));

  // Air sprays → the same shape (no vessels; a single price; gradient art).
  const airEntries: ShopProductInput[] = getAirVolumes().flatMap((volume) =>
    volume.groups.flatMap((group) =>
      group.hours.map((h) => {
        const edition = airEditionOf(volume, h.productSlug);
        editions.set(h.productSlug, { edition, chapterLabel: `The Hours · ${volume.title}` });
        return {
          id: h.id,
          slug: h.productSlug,
          name: h.name,
          tagline: h.story,
          price: h.price,
          sale_price: null,
          is_hero: false,
          is_featured: false,
          created_at: null,
          product_type: airProductType(group.kind),
          collection: { slug: volume.slug, name: volume.title, volume: volume.volume },
          variants: [],
          product_images: [{ url: h.gradient, alt_text: h.name, is_primary: true, sort_order: 0 }],
        } satisfies ShopProductInput;
      }),
    ),
  );

  return { products: [...candleEntries, ...airEntries], editions };
}
