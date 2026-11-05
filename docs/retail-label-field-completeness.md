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

## 7. Physical dimensions verification checklist (Phase 11A — Part A.2)
Every `label_templates` row carries `dimensions_status` (`unverified` by default). A template is **not** cleared for a real print run until an operator completes this checklist for the exact stock + printer and an authorised person flips the status to `verified`. The checklist is deliberately physical — nothing in the DB can prove a millimetre size is correct.

Per template × per vessel format (190 g glass / 150 g ceramic / 100 g candle / 100 ml freshener):

1. **Stock match** — label media physical size (mm) matches the template's declared `width_mm` × `height_mm`; media finish (matte/gloss) and adhesive are the production stock, not a test sheet.
2. **Scale 1:1** — print at 100% (no "fit to page"/auto-scale); measure the printed label with a ruler — width and height within ±0.5 mm of declared.
3. **Margins & safe area** — no text or code within the printer's non-printable margin; human-readable batch code and net-quantity fully inside the trim.
4. **Code legibility** — the encoded value scans/reads at the intended distance; for a barcode/QR, verify with a real scanner that the decoded string **equals** the printed human-readable `batch_code` (the preview already flags a mismatch with ✗).
5. **Small-format legibility** — on the smallest vessel, the mandatory fields (batch code, net quantity, DoM) are legible without magnification.
6. **Bleed/placement on vessel** — a printed label applied to the actual vessel sits within the label well; no wrap-induced distortion of the code.
7. **Sign-off** — record operator, printer model, stock SKU, and date; only a `manufacturing.operate`+ authoriser flips `dimensions_status → verified`. Re-verify if the stock or printer changes.

Until step 7 is done, the admin UI shows **"(dims unverified)"** on the template and a warning banner, and the operator is told to confirm physical size/margins/scaling before any real run. Verification status does **not** gate label *generation* (you can still produce an internal proof); it is an operational gate on committing to a production print.
