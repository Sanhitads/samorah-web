// Production catalogue verification gate.
//
// Confirms the storefront will actually render a catalogue, using the PUBLIC (anon) path — i.e. it
// checks what a real visitor sees through RLS, not privileged ground truth. Run it post-deploy against
// production (or against any environment) to catch an empty / mis-seeded / RLS-hidden catalogue BEFORE
// customers do. This is the reliable gate behind the build-page-count difference: a credential-free
// `next build` prerenders only the static/air routes and leaves DB-backed product PDPs to ISR, so the
// page count is NOT a catalogue check — this script is.
//
//   Local:       npm run verify:catalogue
//   Production:  NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… npm run verify:catalogue
//
// Exit 0 = healthy; exit 1 = catalogue problem (safe to use as a CI/release gate step).

import { readFileSync } from "node:fs";

// ── Load .env.local (CRLF-safe) without clobbering real process env ───────────
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch { /* no .env.local — use process env (prod/CI) */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MIN_PRODUCTS = Number(process.env.CATALOGUE_MIN_PRODUCTS ?? "1");

if (!url || !anon) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, anon, { auth: { persistSession: false } });

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

console.log(`→ Verifying catalogue via the PUBLIC (anon) path at ${url}`);

// 1. Active products visible to the storefront (RLS: products public read where status='active').
const { data: products, error: pErr } = await db.from("products").select("id,slug,name,price").eq("status", "active");
if (pErr) fail(`could not read products as anon (RLS/grant problem?): ${pErr.message}`);
if (!products || products.length < MIN_PRODUCTS) {
  fail(`only ${products?.length ?? 0} active product(s) visible — expected at least ${MIN_PRODUCTS}. Catalogue missing or RLS-hidden.`);
}

// 2. Active, publicly-visible variants (so products are actually buyable) + their prices.
const { data: variants, error: vErr } = await db.from("variants").select("id,product_id,price").eq("is_active", true);
if (vErr) fail(`could not read variants as anon: ${vErr.message}`);
const activeVariants = new Map();
for (const v of variants ?? []) { const a = activeVariants.get(v.product_id) ?? []; a.push(v); activeVariants.set(v.product_id, a); }

console.log(`  active products:  ${products.length}`);
console.log(`  active variants:  ${(variants ?? []).length}`);

// 3. Detect "incorrect / unsellable" products that would render a 200 page with a broken/empty buy box.
const orphans = products.filter((p) => !(activeVariants.get(p.id)?.length));        // no buyable variant
const noSlug = products.filter((p) => !p.slug || !String(p.slug).trim());           // no PDP URL
const badPrice = products.filter((p) => {                                            // nothing to charge
  const vs = activeVariants.get(p.id) ?? [];
  const anyPriced = vs.some((v) => Number(v.price) > 0) || Number(p.price) > 0;
  return !anyPriced;
});

const problems = [];
if (orphans.length) problems.push(`${orphans.length} active product(s) with NO active variant (not buyable): ${orphans.map((p) => p.slug || p.id).join(", ")}`);
if (noSlug.length) problems.push(`${noSlug.length} active product(s) with NO slug (no reachable PDP URL): ${noSlug.map((p) => p.name || p.id).join(", ")}`);
if (badPrice.length) problems.push(`${badPrice.length} active product(s) with NO positive price (unsellable, would render an empty/0 buy box): ${badPrice.map((p) => p.slug || p.id).join(", ")}`);
if (problems.length) fail(problems.join("\n   "));

console.log(`✓ Catalogue OK — ${products.length} active products, all with a slug, a positive price, and ≥1 active variant.`);
process.exit(0);
