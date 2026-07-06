# SAMORAH — Invoice Rules

> Tax-invoice numbering + the immutable snapshot. Types in `lib/orders.ts` +
> `config/commerce.ts` (`INVOICE`); allocation happens in the webhook (Beat 2).

## 1. Numbering — Financial Year, never sequential integers

Format: **`SAM/26-27/000001`** = `INVOICE.prefix` / FY / 6-digit zero-padded seq.

- **Financial year** (India, starts 1 April): `INVOICE.financialYear(date)` →
  `"26-27"` for any date 1 Apr 2026 – 31 Mar 2027. (Tested: May 2026 → 26-27;
  31 Mar 2026 → 25-26.)
- **Sequence** is **per-FY**, from a Postgres sequence, **allocated only on payment
  success**, inside the webhook transaction — so numbers are gapless per FY and no
  number is burned by an abandoned/failed payment.
- `invoiceNumber(seq, date)` builds the string; `order.invoiceNumber` is `null`
  until payment succeeds.

## 2. Immutable snapshot — never recompute from live catalogue

On payment success the order freezes everything needed to reprint the exact invoice
the customer received, even years later after renames / price / GST changes.

**Per line (`OrderLineSnapshot`, paise):** product id · slug · **name** · variant
(vessel · size) · **edition** (`NO. I.1` / `VOL. I.1`) · chapter · hour (air) ·
image ref · unit price · qty · line total · **discount** · net · **HSN** · **GST
rate** · taxable · GST.

**Totals (`OrderTotalsSnapshot`, paise):** subtotal · discount · goods · shipping ·
shipping taxable/GST · taxable value · GST · CGST · SGST · IGST · gift card · total
· payable · currency.

**Promotions (`PromotionSnapshot[]`):** for each applied promotion — code · label ·
**campaign · version** · rule (kind + value) · **amount applied**. So you can
explain months later exactly why ₹261 was taken.

**Provenance stamps:** `taxVersion` · `pricingVersion` · `commerceVersion` — which
rule set produced this invoice.

## 3. B2B / GST invoice

If the customer requested a GST invoice, the order carries `business` (companyName +
validated GSTIN). It prints on the invoice. Format validated at checkout
(`CK-008`): `^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$`.

## 4. Gift orders

`gift.hideInvoice` omits the price-bearing invoice from the parcel; a gift note /
recipient may print instead (UI later; fields reserved now).

## 5. Seller identity (printed)

From `COMMERCE`: legal name · **GSTIN** · registered address · state. Confirm all
before the first live invoice.
