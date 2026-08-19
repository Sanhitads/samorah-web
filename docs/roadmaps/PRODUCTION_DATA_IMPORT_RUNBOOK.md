# Production Data Import Runbook — Gate 2 (Production Data Readiness)

> **Status:** 🔴 **NOT READY.** The platform is engineering-ready (Gate 1 green), but the database
> contains **no loaded production catalog**. This runbook is the exact, ordered procedure to load the
> approved Samorah production data and the checklist of what must be supplied first. It performs **no
> destructive operation** and **invents no data** — every value comes from an approved source or is
> flagged as REQUIRED.

This document was produced from direct inspection of the code, the migrations, the seed scripts, and a
clean local database. It supersedes nothing; it is the operational plan for Gate 2.

---

## 1. Current state (evidence)

**Loaded in DB (clean local baseline):**
| Table | Rows | Notes |
|---|---|---|
| `categories` | 4 | Linen Fresheners, Reed Diffusers, Room Fresheners, Wax Tablets (real HSN 33074900 / 34060000). **Migration-seeded reference data.** |
| `settings` | 10 | `store.name="Samorah"`, currency INR, timezone Asia/Kolkata. **`tax.gstin`, `store.registered_address`, `tax.store_state` are EMPTY.** |
| `users` | 3 | staff (editor) accounts — test/dev. |
| products / collections / variants / media / coupons / bundle_pages / cms_pages / navigation_menus / blogs / reviews / seo_overrides | **0** | **No catalog, no CMS, no navigation loaded.** |
| orders / order_items / inventory_movements | test residue | Local-only, created by the invariant test suite. Not production. |

**Approved source data present in the repo (NOT yet imported):**
| Source | Content |
|---|---|
| `src/data/products.json` | **7 products** (Kashmiri Chai, Modak, Gajar Halwa, Samorah Blush, Golden Citrine, Crimson Velvet, Midnight Amethyst). Rich fields: `tagline, scentGroup, price, originalPrice, featured, vessel, sizes, burnTime, waxBlend, wick, fragranceNotes, story, storyLong, flamePersona, moodTags, culturalReference, lifestyleUse, gradClass`. **No SEO fields. No real image URLs (gradient placeholders).** |
| `src/data/collections.json` | **4 collections**: Dessert Chapter, The Wild Within, Mood Library, Nature Chapter. |
| `src/data/fragrances.json` | Fragrance note data. |
| `src/config/commerce.ts` | Business identity — GSTIN `29BCZPD3150Q1ZS`, legal `SANHITA DAS`, `M/s Samorah`, Bengaluru 560045 address, `@samorahstudio.com` emails. **All real EXCEPT `support.phone = "+91 00000 00000"` (placeholder).** |

**Import scripts:**
| Script | Purpose | Launch use |
|---|---|---|
| `scripts/seed-catalog.mjs` | Upserts categories, collections, products, variants, product_images, fragrance_notes from `src/data/*.json` via service role. | ✅ **The intended catalog import path** — see §3. |
| `scripts/seed-test-coupons.mjs` | Seeds **15 `[TEST]` coupons** incl. auto-apply `AUTO20 / AUTO10 / AUTOFS`. | 🚫 **NEVER run against production.** Dev/test only. |

---

## 2. ⚠️ Reconciliation decision required before import

`src/data/products.json` describes a **candle** catalog (`category: "candle"`, vessel-based variants), but
the DB reference `categories` are **Linen Fresheners / Reed Diffusers / Room Fresheners / Wax Tablets**.
These do not obviously align.

**BUSINESS DECISION REQUIRED:** confirm the authoritative production product line and category taxonomy
before import. `seed-catalog.mjs` will create its own category from the JSON (`Candles`, HSN 3406) — which
may or may not be the intended production taxonomy. **Do not import until this is confirmed.** Do not
assume; do not merge the two taxonomies without sign-off.

---

## 3. How the import works (and its one hard caveat)

`seed-catalog.mjs` loads `.env.local`, then upserts in dependency order:
`categories → collections → products → (per product) variants → product_images → fragrance_notes`.

**Inventory is handled correctly by design — do NOT bypass it:**
- Each variant is **INSERTed** with an opening `stock` value (`seed-catalog.mjs:177`, currently
  placeholder `STOCK[size] ?? 40`). `service_role` has `INSERT(stock)` but **not** `UPDATE(stock)`.
- An **AFTER-INSERT trigger** (`variants_opening_balance_trg` → `variants_ledger_opening`,
  migration `20260817120000_inventory_authority.sql`) writes exactly **one idempotent
  `opening_balance` movement** into `inventory_movements` per new variant. So creation and ledger-start
  are one transaction: **the ledger is anchored automatically and correctly on first seed.**

**HARD CAVEAT — the import is a FIRST-TIME (fresh-catalog) operation, not a re-run:**
- `seed-catalog.mjs` upserts `variants` on `onConflict: "sku"`. On a **re-run** where the SKU already
  exists, the upsert becomes an UPDATE that touches `stock` → **`UPDATE(stock)` is revoked → the upsert
  fails.** This is intentional: after a variant exists, stock changes must flow through
  `apply_stock_movement` / the admin inventory tools, never a direct write.
- **Therefore:** seed the catalog **once** into a fresh (or catalog-empty) target. After that, adjust
  opening/real inventory through the inventory admin (which ledgers every movement). Never re-run
  `seed-catalog.mjs` to change stock.

**Opening stock values are placeholders.** `STOCK[size] ?? 40` is not real inventory. Real opening
counts must be supplied (§5) and either baked into the seed data before the one-time import, or entered
via the inventory admin after import (each entry ledgered).

---

## 4. Step-by-step import procedure (ordered, gated)

> Run against **staging first**, verify, then production. Take a DB snapshot/backup before the production
> run. Never `TRUNCATE` or bulk-`DELETE` catalog tables that already hold real orders/data.

1. **Pre-flight — confirm the target is correct and catalog-empty.**
   Verify `NEXT_PUBLIC_SUPABASE_URL` points at the intended environment and `select count(*) from products`
   is 0 (or you have an explicit, approved plan for existing rows). **Stop** if either is unexpected.
2. **Resolve §2 taxonomy** and finalize `src/data/*.json` (real SEO fields, real opening stock, real image
   references — see §5). Do not import partial/placeholder data to production.
3. **Business identity** — set the empty settings and confirm `commerce.ts`:
   `tax.gstin`, `store.registered_address`, `tax.store_state`, and `support.phone` (§5/§6).
4. **Catalog import (one time):** `node scripts/seed-catalog.mjs` against the target. Confirm the summary
   counts match expectations (products, variants, images, notes).
5. **Media:** upload real product photography to Cloudinary and replace the `gradient:*` placeholders
   (see §5). Verify each product/collection renders a real image on the storefront, not a gradient.
6. **CMS / homepage / navigation / bundle / blogs:** populate via the admin CMS (none are seeded).
   Publish the bundle config; build header/footer navigation; add editorial/journal content.
7. **SEO:** add per-product / per-collection / per-page metadata (title, description, canonical, OG) via
   the SEO admin — products.json carries none.
8. **Coupons:** create ONLY the approved production promotions via the admin. **Do not** run
   `seed-test-coupons.mjs`. If any `[TEST]` coupon exists in the target, remove it
   (`node scripts/seed-test-coupons.mjs --clean`, staging only — never introduce them to prod).
9. **Post-import integrity check (§7).** Then storefront + admin verification (§8).

---

## 5. Per-domain data checklist

Legend: ✅ present & real · ⚠️ present but needs confirmation · ❌ missing (REQUIRED before launch)

| Domain | Source | Required fields | Status |
|---|---|---|---|
| Categories | migration / JSON | name, slug, HSN, GST rate | ⚠️ reconcile taxonomy (§2) |
| Collections | collections.json | name, slug, vol/chapter, description, SEO | ⚠️ import; SEO/description to confirm |
| Products | products.json | name, slug, story, price, category, vessel | ✅ content real · ❌ **SEO missing** |
| Variants | generated | SKU, size, price, **real opening stock** | ⚠️ stock is placeholder (40) |
| Product images | — | Cloudinary URLs, primary + ordering | ❌ **all gradient placeholders** |
| Fragrance notes | fragrances.json + product | top/heart/base, family | ✅ import & verify |
| Pricing | products.json | price, originalPrice | ⚠️ confirm final prices |
| GST/HSN | commerce.ts / categories | HSN, rate, CGST/SGST/IGST | ⚠️ **CA sign-off** |
| Inventory | — | real opening counts (ledgered) | ❌ **real counts required** |
| Bundles | admin | published config, product set, min/max | ❌ none published |
| Coupons | admin | approved production promos only | ❌ (test script must not run) |
| Homepage / CMS | admin | hero, banners, featured, editorial | ❌ not populated |
| Navigation | admin | header/mega/footer links | ❌ none |
| Blogs / journal | admin | posts, images | ❌ none (journal cards use gradients) |
| SEO | SEO admin | title/desc/canonical/OG per page | ❌ none |
| Store settings | settings table | gstin, registered_address, store_state | ❌ **empty** |
| Business contact | commerce.ts | phone, email, address, GSTIN | ⚠️ real except **phone** |
| Legal/policy | legalContent.ts | privacy, terms, shipping, returns | ⚠️ drafted, **pending legal sign-off** |
| Testimonials | testimonials.ts | quotes + attribution | ⚠️ fabricated/unattributed — approve or replace |
| Packaging/logistics | logistics.ts / packaging.ts | real weights & dimensions | ⚠️ placeholder (`TODO(real-data)`) |

---

## 6. Configuration required before launch (non-catalog)

- `support.phone` — replace `commerce.ts:31` placeholder `+91 00000 00000` with the real number
  (propagates to Contact page, JSON-LD, legal pages, transactional emails, and shipping labels).
- `settings`: `tax.gstin`, `store.registered_address`, `tax.store_state` — currently empty strings.
- `SHIPPING_WEBHOOK_SECRET` — set in the production environment (endpoint fails closed / 503 until set).
- Confirm `NEXT_PUBLIC_SITE_URL`, email from/reply-to, and Cloudinary cloud name for production.

---

## 7. Post-import integrity checks (run against the target after import)

Read-only assertions — every one must pass before Gate 2 is green:
- Every `active` product has ≥1 `active`, sellable variant; every active variant belongs to an active product.
- No duplicate SKUs; no duplicate product/collection slugs.
- No orphan variants / images / fragrance notes (all FKs resolve).
- Every variant has a `stock ≥ 0` **and** a matching `opening_balance` movement in `inventory_movements`
  (`idempotency_key = 'opening:'||variant_id`) — proves the ledger anchored on import.
- No product/collection references a missing category/collection.
- No `[TEST]`-tagged coupon exists; no active coupon is unaccounted for.
- No `gradient:*` image remains on a product intended to ship with photography.
- No `example.com` / `localhost` / placeholder string in any customer-facing row.

---

## 8. Verification after data load

**Storefront (verify RENDERED values, not just rows):** Homepage · Collection · Category · Product listing ·
PDP · Cart · Checkout · Search · Navigation · Account · Footer · Content/legal pages.

**Admin:** products/variants/inventory correct; collections/CMS/SEO correct; orders can reference production
products; admin search/filter/sort works.

---

## 9. Guardrails (binding)

- **No invented data.** Every price, SKU, image, GST value, description, phone, or business detail comes
  from an approved source or is left flagged REQUIRED. Missing data blocks launch; it is never fabricated.
- **No destructive production operations.** No `TRUNCATE`, no bulk delete of tables that hold real
  operational data. Import into a fresh/empty catalog; if real data already exists, use a controlled,
  reviewed migration — not a reseed.
- **Inventory only through the ledger.** Opening stock enters via variant creation (auto opening_balance
  movement); all later changes via `apply_stock_movement` / inventory admin. Never a direct `stock` write —
  the database enforces this (`UPDATE(stock)` revoked).
- **Test data never reaches production.** `seed-test-coupons.mjs` is dev-only; the `[TEST]` coupons
  (esp. auto-apply `AUTO20/AUTO10/AUTOFS`) must never exist in production.
- **Analytics is frozen** — untouched by this phase.

---

## 10. Blockers to close Gate 2

**MUST COMPLETE BEFORE LAUNCH**
- Resolve the category↔product taxonomy (§2); import the approved catalog once (§4); real product
  photography; per-product/collection/page SEO; populate CMS/homepage/navigation/bundle; real opening
  inventory; remove any test coupons.

**BUSINESS DATA REQUIRED**
- Real support phone; GSTIN + HSN/GST CA sign-off; final pricing; legal copy approval; testimonials
  authenticity; packaging measurements.

**PRODUCTION CONFIGURATION REQUIRED**
- `SHIPPING_WEBHOOK_SECRET`; store settings (gstin/address/state); site URL / email / Cloudinary for prod.

Gate 2 is **NOT READY** until the MUST-COMPLETE list is loaded and §7 passes on the production target.
