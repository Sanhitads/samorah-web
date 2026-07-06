# SAMORAH — Commerce Architecture

> **Commerce Engine v1.0 · July 2026.** The self-documenting reference for how
> money, tax, promotions, and orders work. Read with `GST_COMPLIANCE.md`,
> `INVOICE_RULES.md`, `ORDER_LIFECYCLE.md`, `PAYMENT_FLOW.md`,
> `COMMERCE_TEST_MATRIX.md`.

## Principles

1. **One source of truth for money** — `src/config/commerce.ts`. Nothing financial
   is hardcoded elsewhere (brand · GSTIN · registered state · tax classes ·
   shipping · invoice · Razorpay env · versions).
2. **One engine** — `src/lib/commerce.ts` `computeOrderTotals()`. Cart, drawer,
   checkout, and the future webhook re-price through the SAME function.
3. **Integer paise internally** — no floats in calculation. See `MONEY_PRECISION`.
4. **GST-inclusive** — prices are inclusive MRP; GST is *extracted*, never added.
5. **Never trust the client** — the server re-prices before payment (Beat 2).
6. **Immutable snapshots + version stamps** — an order freezes its numbers and the
   rule versions that produced them; nothing recomputes from live config.

## The pipeline (deterministic order)

```
line totals (paise)
  → promotions (allocated PER LINE; stacking rules)      lib/promotions.ts
  → per-line taxable + GST extracted at the line's HSN rate   lib/money.ts
  → aggregate goods taxable/GST
  → shipping + shipping GST (composite supply → HIGHEST rate)
  → CGST/SGST (intra-state) vs IGST (inter-state) split
  → gift card (PAYMENT, after tax)
  → amount payable
```

GST is **never** extracted from a discounted cart total — each line is discounted
first, then GST is extracted per line, then summed. See `GST_COMPLIANCE.md`.

## Files

| File | Responsibility |
|---|---|
| `config/commerce.ts` | Config SoT: `COMMERCE` · `TAX_CLASSES` · `SHIPPING` · `INVOICE` · `RAZORPAY` · `TAX_VERSION` · `PRICING_VERSION` · `COMMERCE_ENGINE_VERSION` · `RESERVATION_TTL_MINUTES` |
| `lib/money.ts` | Paise convention: `toPaise` · `toRupees` · `extractPaise` · `formatPaise` |
| `lib/commerce.ts` | `computeOrderTotals()` engine · `toCommerceLines()` |
| `lib/promotions.ts` | Promotion engine (stacking · priority · snapshots) |
| `lib/cart.ts` | `buildCartSummary()` — thin cart view over the engine |
| `lib/checkout.ts` | `calculateOrderTotals()` · address/GSTIN/PIN validation |
| `lib/orders.ts` | Order/invoice/reservation/refund/shipment types + pure helpers |

## Version stamps (forensic provenance)

Frozen on every `OrderTotals` and order — two years later you know exactly which
rules produced an invoice. Bump the relevant constant; old orders keep theirs.

| Stamp | Constant | Bump when |
|---|---|---|
| `taxVersion` | `TAX_VERSION` (`GST_2026_01`) | any HSN/rate in `TAX_CLASSES` changes |
| `pricingVersion` | `PRICING_VERSION` (`PRICE_2026_07`) | shipping thresholds / promotion config change |
| `commerceVersion` | `COMMERCE_ENGINE_VERSION` (`1.0`) | the calculation engine (pipeline/rounding/allocation) changes |

## Money precision (`MONEY_PRECISION`)

| Layer | Representation |
|---|---|
| Internal calculation | **integer paise** (`89900`) — `lib/commerce.ts`, no floats |
| Persistence (order snapshot) | **integer paise** |
| Invoice display | **2 decimals** (`₹899.00`, `₹96.32`) — `formatPaise2` |
| Storefront UI | **whole rupees** (`₹899`) — `formatPaise` |

The UI is the ONLY place paise become rupees. See `lib/money.ts`.

## What's built vs Beat 2

- **Built:** the engine · promotions v2 · config SoT · checkout (address · billing ·
  business GST · notes · consent) · order/invoice/reservation/refund **types +
  pure helpers** · the vitest matrix.
- **Beat 2 (needs Razorpay keys + DB):** create-order · webhook (order source of
  truth) · snapshot persistence · FY invoice allocation · stock reservations ·
  Shiprocket · emails. See `PAYMENT_FLOW.md`.
