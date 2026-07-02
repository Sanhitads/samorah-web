import { createPublicClient } from "@/lib/supabase/public";

// Columns needed to render a product card (listings, rails, recommendations).
const CARD_FIELDS =
  "id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_featured, is_hero, mood_tags, product_images(url, alt_text, is_primary, sort_order)";

export interface ProductFilter {
  fragranceFamily?: string;
  featured?: boolean;
  limit?: number;
}

/** Active products as cards (listings / homepage rails). */
export async function getProducts(filter: ProductFilter = {}) {
  const db = createPublicClient();
  let query = db
    .from("products")
    .select(CARD_FIELDS)
    .order("created_at", { ascending: true });

  if (filter.featured) query = query.eq("is_featured", true);
  if (filter.fragranceFamily) query = query.eq("fragrance_family", filter.fragranceFamily);
  if (filter.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Card fields + collection (chapter) + variants (vessels) + created_at —
// everything the Shop PLP needs to show, filter (chapter × vessel), and sort.
const SHOP_FIELDS =
  "id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_featured, is_hero, created_at, mood_tags, collection:collections!products_collection_id_fkey(slug, name, volume), variants(vessel_type, is_active), product_images(url, alt_text, is_primary, sort_order)";

/** Active products for the Shop PLP, with their chapter — filtered/sorted in the
 *  page builder (pure) so the query stays a simple "all active products" read. */
export async function getShopProducts() {
  const db = createPublicClient();
  const { data, error } = await db
    .from("products")
    .select(SHOP_FIELDS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Full product detail: collection + variants + images + fragrance notes. */
export async function getProductBySlug(slug: string) {
  const db = createPublicClient();
  const { data, error } = await db
    .from("products")
    .select(
      "*, collection:collections!products_collection_id_fkey(id, name, slug, volume), variants(*), product_images(*), fragrance_notes(layer, note, sort_order)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Active variants for a product, ordered. */
export async function getVariants(productId: string) {
  const db = createPublicClient();
  const { data, error } = await db
    .from("variants")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Rule-based related products (USD S8): same fragrance family, else same
 * collection, excluding the product itself. Manual `related_products` overrides
 * are layered in later.
 */
export async function getRelatedProducts(
  product: { id: string; fragrance_family: string | null; collection_id: string | null },
  limit = 4,
) {
  const db = createPublicClient();
  let query = db.from("products").select(CARD_FIELDS).neq("id", product.id).limit(limit);

  if (product.fragrance_family) query = query.eq("fragrance_family", product.fragrance_family);
  else if (product.collection_id) query = query.eq("collection_id", product.collection_id);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
