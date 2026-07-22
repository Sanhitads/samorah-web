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

  // Config gradient + edition per air hour — used to enrich DB air products (which have no photo yet)
  // and to set the "NO. I.4" edition on their cards. Also the source for air volumes not yet in the DB.
  const airGradient = new Map<string, string>();
  for (const volume of getAirVolumes()) {
    for (const group of volume.groups) {
      for (const h of group.hours) {
        airGradient.set(h.productSlug, h.gradient);
        editions.set(h.productSlug, { edition: airEditionOf(volume, h.productSlug), chapterLabel: `The Hours · ${volume.title}` });
      }
    }
  }

  // DB rows keep their real product_type (candles + now the seeded Room/Linen sprays). Air products
  // with no uploaded image fall back to the config gradient so the grid stays colourful.
  const dbEntries = (candles as unknown as ShopProductInput[]).map((c) => {
    const type = c.product_type ?? "candle";
    const isAir = type === "room_spray" || type === "linen_spray";
    const hasImg = (c.product_images ?? []).length > 0;
    const product_images = !hasImg && isAir && airGradient.has(c.slug)
      ? [{ url: airGradient.get(c.slug)!, alt_text: c.name, is_primary: true, sort_order: 0 }]
      : c.product_images;
    return { ...c, product_type: type, product_images };
  });
  const dbSlugs = new Set(dbEntries.map((c) => c.slug));

  // Air sprays from config — only for hours NOT yet in the DB (DB wins → no duplicates).
  const airEntries: ShopProductInput[] = getAirVolumes().flatMap((volume) =>
    volume.groups.flatMap((group) =>
      group.hours
        .filter((h) => !dbSlugs.has(h.productSlug))
        .map((h) => ({
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
        } satisfies ShopProductInput)),
    ),
  );

  return { products: [...dbEntries, ...airEntries], editions };
}
