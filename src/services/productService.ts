import { createPublicClient } from "@/lib/supabase/public";

// Columns needed to render a product card (listings, rails, recommendations).
const CARD_FIELDS =
  "id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_featured, is_hero, is_bestseller, mood_tags, product_images(url, alt_text, is_primary, sort_order)";

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
  "id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_featured, is_hero, is_bestseller, is_new_arrival, product_type, created_at, mood_tags, collection:collections!products_collection_id_fkey(slug, name, volume), variants(vessel_type, is_active), product_images(url, alt_text, is_primary, sort_order)";

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
      "*, collection:collections!products_collection_id_fkey(id, name, slug, volume, tagline, cover_image_url, is_coming_soon), variants(*), product_images(*), fragrance_notes(layer, note, sort_order)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Product types that render the AIR PDP (room / linen fresheners, etc.).
export const AIR_PRODUCT_TYPES = ["room_spray", "linen_spray"];

/** Other air products in the same collection (the air PDP's "Continue the volume"). Ordered by
 *  display order. Returns the fields the air view builder needs; empty if the column set isn't there
 *  yet (pre-migration). */
export async function getAirSiblings(collectionId: string, excludeProductId: string) {
  const db = createPublicClient();
  try {
    const { data } = await db
      .from("products")
      .select("id, slug, name, tagline, price, air_content, product_type, display_order, product_images(url, is_primary, sort_order)")
      .eq("collection_id", collectionId)
      .in("product_type", AIR_PRODUCT_TYPES)
      .neq("id", excludeProductId)
      .order("display_order");
    return data ?? [];
  } catch {
    return [];
  }
}

/** An air volume (chapter) + its active air products, for the DB-driven air chapter page. Returns null
 *  when the collection doesn't exist or has no air products (route falls back to config). */
export async function getAirVolumeData(slug: string) {
  const db = createPublicClient();
  try {
    const { data: col } = await db.from("collections").select("id,name,slug,volume,tagline,cover_image_url,is_coming_soon,sort_order").eq("slug", slug).maybeSingle();
    if (!col) return null;
    const { data: products } = await db
      .from("products")
      .select("id, slug, name, tagline, price, air_content, product_type, display_order, product_images(url, is_primary, sort_order)")
      .eq("collection_id", col.id)
      .in("product_type", AIR_PRODUCT_TYPES)
      .eq("status", "active")
      .order("display_order");
    if (!products || !products.length) return null;
    // The next coming-soon collection becomes the "next volume" teaser at the foot of the page.
    const { data: nextCol } = await db
      .from("collections")
      .select("name,volume,tagline")
      .eq("is_coming_soon", true)
      .gt("sort_order", col.sort_order ?? 0)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    return { col, products, nextCol: nextCol ?? undefined };
  } catch {
    return null;
  }
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
