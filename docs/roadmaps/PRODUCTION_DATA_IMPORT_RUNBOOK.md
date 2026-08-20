# Production Data Import Runbook — Gate 2 (Production Data Readiness)

> **Status:** 🔴 **NOT READY** (data). **Taxonomy / source-of-truth: ✅ RESOLVED** (§2). The platform is
> engineering-ready (Gate 1 green), but the database contains **no loaded production catalog**. This is the
> **canonical, self-contained specification** for the one-time production catalog import: what the launch
> catalog is, exactly how it maps, what must be supplied first, and the authorization gate that must be
> fully checked before the import runs. It performs **no destructive operation** and **invents no data** —
> every value comes from an approved source or is flagged REQUIRED.

Produced from direct inspection of the code, migrations, seed scripts, business docs (BRD, PROJECT_CONTEXT),
and a clean local database. The taxonomy reconciliation in §2 was **reviewed and ACCEPTED** — it is now
canonical.

---

## 1. Current state (evidence)

**Loaded in DB (clean local baseline):**
| Table | Rows | Notes |
|---|---|---|
| `categories` | 4 | Linen Fresheners, Reed Diffusers, Room Fresheners, Wax Tablets (real HSN 33074900 / 34060000). **Provisioned future/scaffolding taxonomy — NOT launch catalog** (see §2). |
| `settings` | 10 | `store.name="Samorah"`, currency INR, timezone Asia/Kolkata. **`tax.gstin`, `store.registered_address`, `tax.store_state` are EMPTY.** |
| `users` | 3 | staff (editor) accounts — test/dev. |
| products / collections / variants / media / coupons / bundle_pages / cms_pages / navigation_menus / blogs / reviews / seo_overrides | **0** | **No catalog, no CMS, no navigation loaded.** |
| orders / order_items / inventory_movements | test residue | Local-only, created by the invariant test suite. Not production. |

**Approved source data present in the repo (NOT yet imported):**
| Source | Content |
|---|---|
| `src/data/products.json` | **7 candle products** (all `category: "candle"`). Rich fields: `tagline, scentGroup, price, originalPrice, featured, vessel, sizes, burnTime, waxBlend, wick, fragranceNotes, story, storyLong, flamePersona, moodTags, culturalReference, lifestyleUse, gradClass`. **No SEO fields. No real image URLs (gradient placeholders).** |
| `src/data/collections.json` | **4 collections**: Dessert Chapter (Vol I), The Wild Within (Vol II), Mood Library (Vol III), Nature Chapter (Vol IV — 0 products). |
| `src/data/fragrances.json` | Fragrance note data. |
| `src/config/commerce.ts` | Business identity — GSTIN `29BCZPD3150Q1ZS`, legal `SANHITA DAS`, `M/s Samorah`, Bengaluru 560045 address, `@samorahstudio.com` emails. **All real EXCEPT `support.phone = "+91 00000 00000"` (placeholder).** |

**Import scripts:**
| Script | Purpose | Launch use |
|---|---|---|
| `scripts/seed-catalog.mjs` | Upserts category, collections, products, variants, product_images, fragrance_notes from `src/data/*.json` via service role. | ✅ **The one-time sanctioned catalog import** — see §3 / §8. |
| `scripts/seed-test-coupons.mjs` | Seeds **15 `[TEST]` coupons** incl. auto-apply `AUTO20 / AUTO10 / AUTOFS`. | 🚫 **NEVER run against production.** Dev/test only. |

---

## 2. ✅ RESOLVED — source of truth & taxonomy (canonical)

**The approved products-table launch catalog is the 7 candle products** in `src/data/products.json` +
`src/data/collections.json` + `src/data/fragrances.json`, imported by the sanctioned importer
`scripts/seed-catalog.mjs`. This is the current approved launch catalog.

**Evidence (business-authority documents, not "whichever is newer"):**
- `docs/PROJECT_CONTEXT.md:20` — *"SAMORAH — a luxury handmade **scented-candle** e-commerce platform for India."*
- `docs/BRD.md` — *"Luxury Handmade **Scented Candles** — Complete Build Reference."*
- Decision 94 — *"MVP scope = Products → Checkout → Razorpay → Shiprocket → Emails."*
- `scripts/seed-catalog.mjs` is the sanctioned Phase-4A importer (candle-only; creates the "Candles" category).
- `src/data/products.json` holds the **only authored products anywhere** (distinct categories = `["candle"]`).

### 2.1 Launch taxonomy (create / use)
| Category | Code | HSN | GST |
|---|---|---|---|
| **Candles** | `SAM-CAN` | `3406` | 12% |

### 2.2 Provisioned future / scaffolding categories — NOT launch catalog
The following existing DB categories are **provisioned future/configuration scaffolding**, seeded by migration
`20260731140000_product_artist_categories.sql` (whose sibling `20260731130000_product_type.sql` explicitly
calls wax tablets / diffusers *"future"*). They are **not competing launch catalog data** and are correctly
empty in the products table:
- room fresheners · linen fresheners
- reed diffusers
- wax tablets
- any other future freshener types defined by the migration

> **Do NOT import candle products into these categories.** They are outside the candle catalog import.

### 2.3 Air line (room / linen sprays) — separate, config-driven
`src/config/theHours.ts` represents the **config-driven Air room/linen spray line**. It is rendered on
`/collections/*` ("The Hours") and merged into `/shop` via `buildShopPage` (DB candles + config sprays). It
is **separate from the products-table candle import** and must **NOT** be converted into products-table
records as part of this import.

> **Air-line launch status: 🟡 BUSINESS DECISION REQUIRED** — whether the config Air spray line ships at
> launch is a merchandising decision. It does not gate the candle import either way.

---

## 3. How the import works (and its one hard caveat)

`seed-catalog.mjs` loads `.env.local`, then upserts in dependency order:
`category (Candles) → collections → products → (per product) variants → product_images → fragrance_notes`.

**Inventory is handled correctly by design — do NOT bypass it (see §7):**
- Each variant is **INSERTed** with an opening `stock` value (`seed-catalog.mjs:177`, currently placeholder
  `STOCK[size] ?? 40`). `service_role` has `INSERT(stock)` but **not** `UPDATE(stock)`.
- An **AFTER-INSERT trigger** (`variants_opening_balance_trg` → `variants_ledger_opening`, migration
  `20260817120000_inventory_authority.sql`) writes exactly **one idempotent `opening_balance` movement**
  into `inventory_movements` per new variant. Creation and ledger-start are one transaction: **the ledger is
  anchored automatically and correctly on first seed.**

**HARD CAVEAT — this is a FIRST-TIME (fresh-catalog) operation, not a re-run (see §8):**
- `seed-catalog.mjs` upserts `variants` on `onConflict: "sku"`. On a **re-run** where the SKU already exists,
  the upsert becomes an UPDATE that touches `stock` → **`UPDATE(stock)` is revoked → the upsert fails.** This
  is intentional: after a variant exists, stock changes must flow through `apply_stock_movement` / the admin
  inventory tools, never a direct write.

---

## 4. Production catalog structure (post-import target)

- **Category (1, created by import):** Candles — `SAM-CAN`, HSN `3406`, 12%.
- **Collections (4 chapters):** Dessert Chapter (Vol I), The Wild Within (Vol II), Mood Library (Vol III),
  Nature Chapter (Vol IV — **0 products**, see §5.2).
- **Products (7 candles):** kashmiri-chai, modak, gajar-halwa → Vol I; samorah-blush, golden-citrine,
  crimson-velvet → Vol II; midnight-amethyst → Vol III.
- **Variants:** vessel × size per product (SKUs `SAM-CAN-00N-{SIZE}-{VESSEL}`), opening balance auto-anchored.
- **Coexisting (untouched by this import):** the 4 provisioned air/future categories (§2.2); the config Air
  spray line (§2.3).

### 4.1 Reconciliation map
- **Categories:** source "Candles" → **CREATE**. Existing 4 air/future categories → **NO CHANGE** (treatment per §5.1).
- **Collections:** dessert-chapter, the-wild-within, mood-library, nature-chapter → **CREATE** (nature-chapter empty → §5.2).
- **Products:** all 7 candles → **CREATE** (products table is empty → pure insert, no updates).
- **Variants:** vessel × size per product → **CREATE** (opening-balance movement auto-anchored).
- **Records to create:** 1 category · 4 collections · 7 products · ~30+ variants · product_images (placeholder) · fragrance_notes.
- **Records to update:** **none.**
- **Records to deactivate:** none by the importer — a **business decision** (§5.1 / §5.2), applied via admin, not this import.

---

## 5. Empty customer-facing categories & collections (do NOT delete)

### 5.1 Empty future categories
The 4 provisioned air/future categories (§2.2) are currently `is_active = true` with 0 products, so they
could render **empty customer-facing category pages** at launch.

> **They must NOT simply be deleted.** Before public launch, business must decide whether each should be:
> - **hidden / deactivated** until populated, **OR**
> - intentionally exposed as a controlled **"Coming Soon"** experience.
>
> **Default recommendation: hide / deactivate empty future categories** unless explicitly intended as Coming
> Soon. (Applied via the admin, not by this import, not by SQL delete.)

### 5.2 Empty Nature Chapter (Vol IV)
Nature Chapter has **no launch products**. Before launch, business must decide whether it should:
- **remain hidden**, **OR**
- intentionally display as **Coming Soon**.

> **Do NOT invent a product merely to populate it.**

---

## 6. Production data still required (mandatory pre-import inputs)

Legend: ✅ AVAILABLE · ❌ MISSING · ⚠️ REQUIRES BUSINESS APPROVAL · ⬜ NOT APPLICABLE

| Item | Status |
|---|---|
| Product names, SKUs, variants, fragrance data, product stories, collections | ✅ AVAILABLE (`src/data`) |
| **Final approved prices** | ✅ present · ⚠️ **REQUIRES BUSINESS APPROVAL** (confirm final) |
| **GST / HSN** (3406 / 12%) | ✅ present · ⚠️ **REQUIRES BUSINESS/CA CONFIRMATION** (Decision P17) |
| Category taxonomy (Candles) | ✅ AVAILABLE; air-category treatment ⚠️ business (§5.1) |
| **Actual opening inventory (every sellable variant)** | ❌ **MISSING — REQUIRED** |
| **Final product photography** | ❌ **MISSING — REQUIRED** |
| **Per-product SEO** (title / description / OG) | ❌ **MISSING — REQUIRED** |
| **Homepage / CMS content** | ❌ **MISSING — REQUIRED** |
| **Final navigation / merchandising decisions** | ❌ **MISSING — REQUIRED** |
| **Final business / support information** (esp. support phone) | ❌ support phone MISSING; rest ✅ except confirm GSTIN before first invoice |
| **Legal / policy approval** | ✅ drafted · ⚠️ **REQUIRES BUSINESS/LEGAL APPROVAL** |
| Air spray products (room/linen) | ⬜ NOT APPLICABLE to this import (config-driven, §2.3) |
| Reed diffusers / wax tablets | ⬜ NOT APPLICABLE (documented future line, no content) |

### 6.1 Explicit PLACEHOLDER classifications (never treat as production)
- **Opening stock value `40`** (`seed-catalog.mjs` `STOCK[size] ?? 40`) is a **PLACEHOLDER**. It must
  **never** be treated as production opening stock. Real per-variant opening counts are a mandatory input.
- **`gradient:*` images** (products & collections) are **PLACEHOLDERS**. They must **never** be treated as
  launch photography. Real photography (→ Cloudinary) is a mandatory input.

---

## 7. Inventory import — via the ledger only (binding)

Opening inventory **must** use the project's approved inventory-authority / ledger mechanism:
- Opening stock enters via **variant creation**, which auto-writes the `opening_balance` movement (§3).
- All later changes go through `apply_stock_movement` / the inventory admin — each ledgered.

> **Do NOT instruct anyone to directly `UPDATE variants.stock`.** The database enforces this (`UPDATE(stock)`
> revoked from `service_role`). The import must preserve: opening balance · inventory ledger · movement
> history · auditability · the non-negative invariant · inventory-authority rules.

To load **real** opening counts: set the true per-variant opening quantities in the seed source **before** the
one-time import (so the auto opening_balance movement records the real number), **or** create variants at 0
and enter real counts via the inventory admin (each ledgered). Never re-run the importer to change stock (§8).

---

## 8. One-time import safety (binding)

`scripts/seed-catalog.mjs` is a **ONE-TIME, fresh-catalog importer.** It is safe on an empty catalog and
**fails by design if re-run** over existing variants (the stock UPDATE is revoked — §3).

**Before executing it against production, ALL of the following must hold:**
- a **staging / fresh-database dry run has passed**,
- **production data is complete** (§6 — no MISSING items remain),
- **production values are approved** (§6 — no open ⚠️ items),
- **integrity checks pass** (§9),
- **storefront verification passes** (§10),
- **admin verification passes** (§10),
- **no placeholder data remains** (no `40` stock, no `gradient:*` image, no `[TEST]` coupon, no placeholder phone).

> **Do NOT re-run the importer against an already-imported production catalog.** Post-launch catalog changes
> go through the admin (products/variants/inventory), never a reseed.

Take a database snapshot/backup before the production run. Never `TRUNCATE` or bulk-`DELETE` catalog tables.

---

## 9. Post-import integrity checks (read-only; all must pass)

- Every `active` product has ≥1 `active`, sellable variant; every active variant belongs to an active product.
- No duplicate SKUs; no duplicate product/collection slugs.
- No orphan variants / images / fragrance notes (all FKs resolve).
- Every variant has `stock ≥ 0` **and** a matching `opening_balance` movement
  (`idempotency_key = 'opening:'||variant_id`) — proves the ledger anchored on import.
- No product/collection references a missing category/collection.
- No `[TEST]`-tagged coupon exists; no active coupon is unaccounted for.
- No `gradient:*` image remains on a product intended to ship with photography.
- No `example.com` / `localhost` / placeholder string (incl. `+91 00000 00000`) in any customer-facing row.

---

## 10. Verification after data load

**Storefront (verify RENDERED values, not just rows):** Homepage · Collection · Category · Product listing ·
PDP · Cart · Checkout · Search · Navigation · Account · Footer · Content/legal pages. Confirm empty future
categories (§5.1) and Nature Chapter (§5.2) render per the confirmed business decision (hidden or Coming Soon).

**Admin:** products/variants/inventory correct; collections/CMS/SEO correct; orders can reference production
products; admin search/filter/sort works.

---

## 11. 🚦 PRODUCTION IMPORT AUTHORIZATION (final gate)

The one-time production import is authorized **only when every box is checked.** Unchecked = NOT authorized.

```
PRODUCTION IMPORT AUTHORIZATION

[ ] 7 candle catalog confirmed
[ ] taxonomy confirmed (Candles · SAM-CAN · HSN 3406 · GST 12%)
[ ] Air-line launch decision confirmed (§2.3)
[ ] empty future category treatment confirmed (§5.1)
[ ] Nature Chapter treatment confirmed (§5.2)
[ ] final prices approved
[ ] GST/HSN approved (business/CA)
[ ] actual opening inventory supplied (every sellable variant; not the placeholder 40)
[ ] final photography supplied (no gradient placeholders)
[ ] SEO complete (per product / collection / page)
[ ] homepage/CMS complete
[ ] business information complete
[ ] support phone confirmed (replaces +91 00000 00000)
[ ] legal copy approved
[ ] staging import successful
[ ] staging integrity checks successful
[ ] storefront verified
[ ] admin verified
[ ] no placeholder/test data remains
```

> Only when **ALL** required launch items are complete does this runbook authorize the one-time production
> import. Until then, Gate 2 is **NOT READY**.

---

## 12. Guardrails (binding)

- **No invented data.** Every price, SKU, image, GST value, description, phone, or business detail comes from
  an approved source or stays flagged REQUIRED. Missing data blocks launch; it is never fabricated.
- **No destructive production operations.** No `TRUNCATE`, no bulk delete, no category deactivation via SQL —
  merchandising decisions (§5) are applied through the admin.
- **Inventory only through the ledger** (§7). Never a direct `stock` write.
- **Test data never reaches production.** `seed-test-coupons.mjs` is dev-only; the `[TEST]` coupons (esp.
  auto-apply `AUTO20/AUTO10/AUTOFS`) must never exist in production.
- **Analytics is frozen** — untouched by this phase.
