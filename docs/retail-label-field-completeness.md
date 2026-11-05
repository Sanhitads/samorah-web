# SAMORAH — Retail Label Field Completeness Audit (India-facing) — DRAFT for review

**Status:** audit for review/sign-off. Nothing here is auto-printed. The label system refuses to fabricate any missing field; retail/product labels are blocked server-side for non-released, held or recalled batches. This document separates what the database can authoritatively supply from what needs a business or legal decision. **Not legal advice — confirm current obligations with counsel before any retail print.**

## 1. Verified — current authoritative DB values (safe to print)
Supplied by `batch_label_payload` from products/variants/manufacturing_batches:
- **Batch code** — immutable, server-generated (`manufacturing_batches.batch_code`); never regenerated at print.
- **Product name / variant** (`products.name`, `variants.variant_name`).
- **Net quantity** — from `variants.size_label` (e.g., `100g`, `190g`, `150g`, `100ml`). *Format of the declaration (e.g., "Net Wt. 100 g ⊝") is a legal-format decision — see §3.*
- **Vessel / SKU / HSN code** (internal/logistics; HSN is tax, not a consumer field).
- **Date of manufacture** — `manufacturing_batches.manufacturing_date`. *Printed-date format is a legal decision — see §3.*
- **Lifecycle & recall status** — used only to gate eligibility (never printed on a retail label).

## 2. Missing business details (SAMORAH must provide; not in the DB, not invented)
- **Manufacturer name & full address** (and, if applicable, packer/importer).
- **Consumer-care contact** (name, phone/email, address for complaints).
- **MRP** inclusive of all taxes (per SKU; the system stores a selling `price`, not a declared MRP).
- **Month & year of manufacture/packing** presentation, and any batch/lot wording required alongside the code.

## 3. Missing legal / compliance decisions (require explicit review — do not assume)
Depending on how the product is classified and sold in India, some of the following may apply; each needs a decision:
- **Country of origin** declaration.
- **Net-quantity declaration format** per the Legal Metrology (Packaged Commodities) rules (unit symbols, placement, font/size minimums).
- **Date-of-manufacture format** and any "best before / use by" applicability.
- **Licence / registration numbers** if the product category requires them.
- **Ingredient / material declaration** and any **mandatory safety warnings** (e.g., candle burn-safety cautions) if applicable to the category.
- Applicable **standards marks / certifications**, only if genuinely held.

> The system will not print any of these until provided and approved. Retail payloads enumerate the missing set so an operator cannot unknowingly ship an incomplete label.

## 4. Optional branding (safe, non-regulatory)
Logo, collection/edition name, tagline, care instructions. **Confidential fragrance formulations are never placed on a consumer-facing label.**

## 5. Packaging dimensions
Template dimensions are stored with `dimensions_status = 'unverified'` and must be **physically verified** before a retail print run (the 190 g glass / 150 g ceramic / 100 g candle / 100 ml freshener formats). The preview handles small formats legibly; do not assume unverified mm sizes are correct.

## 6. Open items for sign-off
- Confirm the product's legal classification and the exact Legal Metrology fields/format it must carry.
- Provide manufacturer/packer/consumer-care details and per-SKU MRP.
- Decide ingredient/warning declarations and any licence/certification lines.
- Verify each format's physical label dimensions, then flip the template `dimensions_status` to `verified`.
