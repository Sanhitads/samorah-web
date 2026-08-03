/**
 * Seed a ready-made set of Phase-1 TEST coupons (every code tagged "[TEST] …" in its description).
 * Idempotent: removes any prior [TEST] coupons first (cascade-drops their targets), then re-creates them
 * against your REAL catalogue (Candles category, Dessert Chapter, Kashmiri Chai, etc).
 *
 *   Seed / re-seed:  node --env-file=.env.local scripts/seed-test-coupons.mjs
 *   Remove them:     node --env-file=.env.local scripts/seed-test-coupons.mjs --clean
 *
 * Safe: only ever touches coupons whose description starts with "[TEST]". Never a real coupon.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing Supabase env — run with --env-file=.env.local"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p, i = {}) => fetch(`${URL}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
const clean = process.argv.includes("--clean");
const TAG = "[TEST]";

// Most coupons are unlimited-per-customer so you can reuse them across test orders; ONCE is the exception.
const COUPONS = [
  { code: "SAVE10",    type: "percent",       value: 10,               desc: "10% off everything" },
  { code: "SAVE10CAP", type: "percent",       value: 10, maxDisc: 300, desc: "10% off, capped at ₹300" },
  { code: "FLAT200",   type: "fixed",         value: 200,              desc: "₹200 off" },
  { code: "FREESHIP",  type: "free_shipping", value: 0,                desc: "Free shipping" },
  { code: "CANDLE15",  type: "percent",       value: 15,               desc: "15% off Candles",      targets: [{ m: "include", t: "category", slug: "candles" }] },
  { code: "DESSERT15", type: "percent",       value: 15,               desc: "15% off Dessert Chapter", targets: [{ m: "include", t: "collection", slug: "dessert-chapter" }] },
  { code: "KASHMIR10", type: "percent",       value: 10,               desc: "10% off Kashmiri Chai", targets: [{ m: "include", t: "product", slug: "kashmiri-chai" }] },
  { code: "AIR20",     type: "percent",       value: 20,               desc: "20% off room + linen sprays", targets: [{ m: "include", t: "product_type", value: "room_spray" }, { m: "include", t: "product_type", value: "linen_spray" }] },
  { code: "SITE15",    type: "percent",       value: 15,               desc: "15% off Candles, excl. Kashmiri Chai", targets: [{ m: "include", t: "category", slug: "candles" }, { m: "exclude", t: "product", slug: "kashmiri-chai" }] },
  { code: "NOSALE10",  type: "percent",       value: 10, excludeSale: true, desc: "10% off, excludes sale items" },
  { code: "ONCE",      type: "percent",       value: 10, perUser: 1,   desc: "10% off — 1 per customer" },
  { code: "AUTO20",    type: "percent",       value: 20, auto: true, priority: 10, desc: "AUTO 20% (no code)" },
  { code: "AUTO10",    type: "percent",       value: 10, auto: true, priority: 20, desc: "AUTO 10% (no code)" },
  { code: "AUTOFS",    type: "free_shipping", value: 0,  auto: true,  desc: "AUTO free shipping (no code)" },
  { code: "LASTONE",   type: "percent",       value: 10, maxUses: 1,  desc: "10% off — only 1 total use (final-slot / never-overcharge)" },
];

const row = (c) => ({
  code: c.code, description: `${TAG} ${c.desc}`, type: c.type, value: c.value ?? 0,
  max_discount: c.maxDisc ?? null, min_order: c.minOrder ?? 0,
  max_uses: c.maxUses ?? null, max_uses_per_user: c.perUser ?? null,
  auto_apply: c.auto ?? false, combinable: c.combinable ?? false,
  priority: c.priority ?? 100, exclude_sale: c.excludeSale ?? false,
  first_order_only: false, is_active: true,
});

const idBySlug = async (table, slug) => (await rest(`${table}?slug=eq.${slug}&select=id`).then((r) => r.json()))[0]?.id;

(async () => {
  // 1) Remove any existing [TEST] coupons (cascade removes their targets).
  const all = await rest(`coupons?select=id,description`).then((r) => r.json());
  const stale = (Array.isArray(all) ? all : []).filter((c) => (c.description || "").startsWith(TAG)).map((c) => c.id);
  for (const id of stale) await rest(`coupons?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  console.log(`Removed ${stale.length} existing [TEST] coupon(s).`);
  if (clean) { console.log("Done (clean only)."); return; }

  // 2) Create the set + targets.
  let made = 0;
  for (const c of COUPONS) {
    const ins = await rest("coupons", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row(c)) }).then((r) => r.json());
    const coupon = Array.isArray(ins) ? ins[0] : ins;
    if (!coupon?.id) { console.error(`  ✗ ${c.code}: ${JSON.stringify(ins)}`); continue; }
    for (const t of c.targets ?? []) {
      const body = { coupon_id: coupon.id, mode: t.m, target_type: t.t };
      if (t.t === "product_type") body.product_type = t.value;
      else {
        const table = t.t === "category" ? "categories" : t.t === "collection" ? "collections" : "products";
        const tid = await idBySlug(table, t.slug);
        if (!tid) { console.error(`  ! ${c.code}: no ${t.t} '${t.slug}' — skipping that rule`); continue; }
        body[`${t.t}_id`] = tid;
      }
      const tr = await rest("coupon_targets", { method: "POST", body: JSON.stringify(body) });
      if (tr.status !== 201) console.error(`  ! ${c.code} target ${t.m}/${t.t}: ${await tr.text()}`);
    }
    made++;
  }

  console.log(`\nSeeded ${made}/${COUPONS.length} [TEST] coupons:\n`);
  for (const c of COUPONS) {
    const tgt = (c.targets ?? []).map((t) => `${t.m === "exclude" ? "−" : "+"}${t.t}:${t.slug ?? t.value}`).join(" ");
    const flags = [c.auto && "auto", c.perUser && `≤${c.perUser}/cust`, c.maxUses && `≤${c.maxUses} total`, c.excludeSale && "excl-sale", c.maxDisc && `cap₹${c.maxDisc}`].filter(Boolean).join(" ");
    console.log(`  ${c.code.padEnd(10)} ${c.type === "free_shipping" ? "free-ship" : c.type === "percent" ? c.value + "%" : "₹" + c.value}`.padEnd(28) + `${flags} ${tgt}`.trim());
  }
  console.log(`\nAll are ACTIVE. Remove them with:  node --env-file=.env.local scripts/seed-test-coupons.mjs --clean`);
})();
