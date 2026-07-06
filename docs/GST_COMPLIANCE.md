# SAMORAH — GST Compliance

> How Samorah computes Indian GST. Implemented in `lib/commerce.ts` +
> `lib/money.ts`; regression-tested in `commerce.test.ts` (see
> `COMMERCE_TEST_MATRIX.md` §D). Confirm all HSN/rates with a CA before go-live.

## 1. Inclusive pricing — extract, never add

Prices are **GST-inclusive MRP**. GST is **extracted** from the inclusive amount:

```
taxable = round(inclusive / (1 + rate/100))      # integer paise
gst     = inclusive − taxable                     # exact; taxable + gst = inclusive
```

## 2. THE ROUNDING RULE (one rule — never change it)

**GST is extracted and rounded PER LINE, in integer paise, then summed.**

- Each line's discount is allocated first → net inclusive.
- GST is extracted from each line's net at **that line's** rate and rounded to the
  nearest paise (`Math.round`).
- Line GSTs are summed to the header. Because each line is an integer paise value,
  **Σ line taxes = header tax exactly** — no ₹0.01 drift (test `GST-005`).
- Shipping GST is extracted once (see §5) and added to the header.

We do **not** compute GST on the whole-order total and back-fill lines. Per-line is
the only rule; changing it would break historical invoices, so it is frozen and
stamped via `commerceVersion`.

## 3. HSN + per-type rates

Every line resolves HSN + rate from `TAX_CLASSES` (config). Never a global rate.

| Product type | HSN | GST |
|---|---|---|
| Scented candle | 3406 | 12% |
| Room spray / Linen spray | 3307 | 18% |
| Wax melt | 3406 | 12% |
| Accessory | 9603 | 18% |
| Gift set | 3406 | 12% |
| Shipping / freight | 9968 | see §5 |

When variants gain their own HSN/rate columns (Beat 2), those override `TAX_CLASSES`.

## 4. Place of supply — CGST/SGST vs IGST

Place of supply = the **delivery (shipping) state**.

- **Intra-state** (state === `STORE_STATE`): GST splits into **CGST + SGST**
  (`cgst = round(gst/2)`, `sgst = gst − cgst`).
- **Inter-state**: the whole GST is **IGST**.
- `cgst + sgst + igst === gst` always (test `GST-005`).
- The **PIN ↔ state cross-check** (`pinStateMismatch`, `CK-009`) blocks a confident
  mismatch (e.g. Delhi PIN + "Maharashtra") so the wrong split is never computed.
  Beat 2: Shiprocket's PIN→state becomes authoritative.

## 5. Shipping — composite supply, HIGHEST rate

Shipping is a **taxable** service bundled with the goods. Its GST rate = the
**highest rate present in the cart** (composite/mixed supply; conservative):

- all-candle cart → shipping GST **12%**
- candle + spray cart → shipping GST **18%** (test `GST-004`)

Example: ₹99 shipping @ 12% → taxable ₹88.39, GST ₹10.61.

## 6. Discounts before tax; gift cards after tax

- **Coupons / composition** are **discounts** — applied and allocated per line
  *before* GST extraction (so tax is on the discounted value). Test `GST-002`.
- **Gift cards / loyalty** are **payment** — applied *after* tax, reducing the
  amount payable, not the taxable value. A 100%-gift-card order → `payable = ₹0`
  → **Razorpay is bypassed** (`GC-001`).
- A **100% discount** (free order) → taxable ₹0, GST ₹0, no shipping (`GST-006`).

## 7. Immutability + tax version

Every order stores `taxVersion`. If the government changes GST later, **old
invoices keep their original rate** (they never recompute); new orders use the new
table after `TAX_VERSION` is bumped. See `INVOICE_RULES.md`.
