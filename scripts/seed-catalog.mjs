// Phase 4A — Catalog seeding (idempotent).
//
// Seeds categories, collections, products, variants, product_images, and
// fragrance_notes from src/data/*.json via the Supabase service role (bypasses
// RLS). Re-runnable: upserts on natural keys; product_images are reset per
// product. Run:  node scripts/seed-catalog.mjs
//
// Narrative fields (story, story_long, flame_persona, cultural_reference,
// lifestyle_use) and SEO are intentionally NOT seeded — later phases.

import { readFileSync } from "node:fs";
import { PostgrestClient } from "@supabase/postgrest-js";

// ── Load .env.local (CRLF-safe) ───────────────────────────────────────────────
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/\r$/, "").trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
// DB-only client (no Realtime/WebSocket). Service-role headers bypass RLS.
const supabase = new PostgrestClient(`${url}/rest/v1`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});

// ── Source data ───────────────────────────────────────────────────────────────
const products = JSON.parse(readFileSync("src/data/products.json", "utf8"));
const collections = JSON.parse(readFileSync("src/data/collections.json", "utf8"));

// ── Seed-default generation rules (admin can adjust later) ─────────────────────
const VESSEL_CODE = { Glass: "GL", Ceramic: "CE", Terracotta: "TE" };
const VESSEL_ENUM = { Glass: "glass", Ceramic: "ceramic", Terracotta: "terracotta" };
const FAMILY = {
  "Warm Spiced Gourmand": "Dessert/Gourmand",
  "Sweet Oriental": "Oriental",
  "Sweet Floral": "Floral",
  "Fresh Citrus": "Fresh",
  "Smoky Woods": "Woody",
  "Fresh Earthy Green": "Fresh",
};
const PRICE_MULT = { "100g": 0.65, "140g": 0.8, "180g": 0.95, "200g": 1.0, "350g": 1.6 };
const STOCK = { "100g": 60, "140g": 50, "180g": 45, "200g": 40, "350g": 20 };
const WEIGHT = { "100g": 350, "140g": 450, "180g": 520, "200g": 560, "350g": 880 };

const roundTo10 = (n) => Math.round(n / 10) * 10;

function die(label, error) {
  if (error) {
    console.error(`✗ ${label}:`, error.message ?? error);
    process.exit(1);
  }
}

async function main() {
  // 1) Category — Candles
  const { data: cat, error: catErr } = await supabase
    .from("categories")
    .upsert(
      {
        name: "Candles",
        slug: "candles",
        sku_prefix: "SAM-CAN",
        default_hsn_code: "3406",
        default_gst_rate: 12,
        sort_order: 1,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  die("categories", catErr);
  const candlesId = cat.id;

  // 2) Collections (hero_product_id set after products exist)
  const collectionId = {}; // json id -> uuid
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    const { data, error } = await supabase
      .from("collections")
      .upsert(
        {
          name: c.name,
          slug: c.slug,
          volume: c.volume,
          tagline: c.tagline,
          poetic_line: c.poeticLine,
          description: c.description,
          cover_image_url: `gradient:${c.gradClass}`,
          is_coming_soon: !!c.comingSoon,
          is_active: true,
          sort_order: i + 1,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    die(`collections (${c.slug})`, error);
    collectionId[c.id] = data.id;
  }

  // 3) Products
  const productId = {}; // slug -> uuid
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const baseSku = `SAM-CAN-${String(i + 1).padStart(3, "0")}`;
    const { data, error } = await supabase
      .from("products")
      .upsert(
        {
          name: p.name,
          slug: p.slug,
          base_sku: baseSku,
          category_id: candlesId,
          collection_id: collectionId[p.chapter] ?? null,
          tagline: p.tagline,
          scent_group: p.scentGroup,
          fragrance_family: FAMILY[p.scentGroup] ?? null,
          mood_tags: p.moodTags ?? [],
          burn_time: p.burnTime,
          wax_blend: p.waxBlend,
          wick: p.wick,
          price: p.price,
          sale_price: p.originalPrice ?? null,
          hsn_code: "3406",
          gst_rate: 12,
          status: "active",
          is_featured: !!p.featured,
          is_hero: !!p.hero,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    die(`products (${p.slug})`, error);
    productId[p.slug] = data.id;
  }

  // 4) Collection hero_product_id
  for (const c of collections) {
    if (c.heroCandle && productId[c.heroCandle]) {
      const { error } = await supabase
        .from("collections")
        .update({ hero_product_id: productId[c.heroCandle] })
        .eq("id", collectionId[c.id]);
      die(`collection hero (${c.slug})`, error);
    }
  }

  // 5) Variants + 6) product_images + 7) fragrance_notes
  let variantCount = 0;
  let noteCount = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pid = productId[p.slug];
    const baseSku = `SAM-CAN-${String(i + 1).padStart(3, "0")}`;

    // Variants — vessel × size
    const variants = [];
    let sort = 0;
    for (const vessel of p.vessel) {
      for (const size of p.sizes) {
        const mult = PRICE_MULT[size] ?? 1;
        const price = size === "200g" ? p.price : roundTo10(p.price * mult);
        variants.push({
          product_id: pid,
          sku: `${baseSku}-${size.toUpperCase()}-${VESSEL_CODE[vessel]}`,
          variant_name: `${size} ${vessel}`,
          vessel_type: VESSEL_ENUM[vessel],
          size_label: size,
          price,
          stock: STOCK[size] ?? 40,
          low_stock_threshold: 5,
          weight_grams: WEIGHT[size] ?? null,
          is_active: true,
          sort_order: sort++,
        });
      }
    }
    die(`variants (${p.slug})`, (await supabase.from("variants").upsert(variants, { onConflict: "sku" })).error);
    variantCount += variants.length;

    // Product image — gradient placeholder (replaced by Cloudinary per the SPD phase)
    await supabase.from("product_images").delete().eq("product_id", pid);
    die(
      `product_images (${p.slug})`,
      (
        await supabase.from("product_images").insert({
          product_id: pid,
          url: `gradient:${p.gradClass}`,
          alt_text: `${p.name} — handmade scented candle by Samorah`,
          is_primary: true,
          sort_order: 0,
        })
      ).error,
    );

    // Fragrance notes — top / heart / base
    const notes = [];
    for (const layer of ["top", "heart", "base"]) {
      const arr = p.fragranceNotes?.[layer] ?? [];
      arr.forEach((note, idx) => notes.push({ product_id: pid, layer, note, sort_order: idx }));
    }
    die(
      `fragrance_notes (${p.slug})`,
      (await supabase.from("fragrance_notes").upsert(notes, { onConflict: "product_id,layer,note" })).error,
    );
    noteCount += notes.length;
  }

  console.log(
    `✓ Seeded: 1 category, ${collections.length} collections, ${products.length} products, ` +
      `${variantCount} variants, ${products.length} product images, ${noteCount} fragrance notes`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
