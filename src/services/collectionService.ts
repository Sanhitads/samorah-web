import { createPublicClient } from "@/lib/supabase/public";
import { editionLabel } from "@/lib/chapterPage";

export interface ProductEdition {
  edition: string; // "VOL. I.1"
  chapterLabel: string; // "Vol. I — Dessert Chapter"
}

/**
 * A slug → { edition, chapterLabel } map for EVERY product, computed once from
 * the collections + their products (hero first, then by creation). The single
 * source of the Samorah numbering, so the PDP, cart, and composition all show
 * identical "VOL. I.1 / Vol. I — Dessert Chapter" metadata.
 */
export async function getEditionMap(): Promise<Map<string, ProductEdition>> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("collections")
    .select(
      "name, volume, hero_product_id, products:products!products_collection_id_fkey(id, slug, is_hero, created_at)",
    );
  if (error) throw error;

  const map = new Map<string, ProductEdition>();
  for (const c of (data ?? []) as unknown as {
    name: string;
    volume: string | null;
    hero_product_id: string | null;
    products: { id: string; slug: string; is_hero: boolean | null; created_at: string | null }[] | null;
  }[]) {
    const prods = c.products ?? [];
    const heroId = c.hero_product_id ?? prods.find((p) => p.is_hero)?.id ?? prods[0]?.id;
    const rest = prods
      .filter((p) => p.id !== heroId)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    const ordered = [...prods.filter((p) => p.id === heroId), ...rest];
    const chapterLabel = c.volume ? `${c.volume} — ${c.name}` : c.name;
    ordered.forEach((p, i) => map.set(p.slug, { edition: editionLabel(c.volume, i + 1), chapterLabel }));
  }
  return map;
}

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
      "*, products:products!products_collection_id_fkey(id, slug, name, tagline, scent_group, fragrance_family, price, sale_price, is_hero, is_featured, created_at, product_type, air_content, pdp_content, product_images(url, alt_text, is_primary)), hero:products!collections_hero_product_id_fkey(id, slug, name, tagline)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}
