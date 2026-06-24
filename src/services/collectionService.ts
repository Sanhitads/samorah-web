import { createPublicClient } from "@/lib/supabase/public";

/** All active collections (chapters), ordered. */
export async function getCollections() {
  const db = createPublicClient();
  const { data, error } = await db
    .from("collections")
    .select(
      "id, name, slug, volume, tagline, poetic_line, description, cover_image_url, is_coming_soon, hero_product_id",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * A collection with its active products + hero product.
 * Disambiguates the two products<->collections relationships by FK name:
 *   • products.collection_id  -> products_collection_id_fkey  (the collection's products)
 *   • collections.hero_product_id -> collections_hero_product_id_fkey (the hero)
 */
export async function getCollectionBySlug(slug: string) {
  const db = createPublicClient();
  const { data, error } = await db
    .from("collections")
    .select(
      "*, products:products!products_collection_id_fkey(id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_hero, product_images(url, alt_text, is_primary)), hero:products!collections_hero_product_id_fkey(id, slug, name, tagline)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}
