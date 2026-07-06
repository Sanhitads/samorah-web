# SAMORAH Commerce Test Matrix — v1.0

> The team's **definition of done** for commerce. Every new commerce feature
> **must add its cases here**, and the automated ones to the `vitest` suite
> (`npm test`). Run the automated suite before every release; walk the manual /
> E2E rows before taking real orders.

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | **Automated** — a passing `vitest` case (file · test) |
| 🔷 | **Beat 2** — architecture/contract in place; runtime test lands with Razorpay/webhooks/DB |
| 🖐 | **Manual / E2E** — walk it in the browser before release |

Automated coverage today: **44 passing** across `commerce.test.ts`,
`orders.test.ts`, `promotions.test.ts`, `checkout.test.ts`, `shopPage.test.ts`,
`useCartStore.test.ts`, `useCompositionStore.test.ts`.

---

## A. Cart

| ID | Scenario | Expected | Status |
|---|---|---|---|
| CART-001 | Add one candle | 1 item, correct price, GST included | ✅ store · "add merges" |
| CART-002 | Increase qty 1→2 | Merges, totals recalculate | ✅ store · "CART-001/002" |
| CART-003 | Remove product | Cart empties (qty 0 drops line) | ✅ store · "CART-003" |
| CART-004 | Refresh browser | Cart persists (localStorage) | 🖐 |
| CART-005 | Open in new tab | Cart identical | 🖐 |
| CART-006 | Guest checkout, no login | Cart works | 🖐 |

## B. Discovery Composition

| ID | Scenario | Expected | Status |
|---|---|---|---|
| COMP-001 | Add 3 Glass candles | Composition complete | ✅ compositionStore · "COMP-001" |
| COMP-002 | Add 2 candles | No discount | ✅ store + commerce (incomplete → no promo) |
| COMP-003 | Add 4th candle | Blocked (max 3) | ✅ compositionStore · "COMP-003" |
| COMP-004 | Mix Glass + Ceramic | Rejected (no mixing) | ✅ compositionStore · "COMP-004" |
| COMP-005 | Remove one candle | Bundle invalid, discount removed | ✅ store + cart · "COMP-005" |
| COMP-006 | Edit composition | Existing composition loads | ✅ compositionStore · "COMP-006/008" |
| COMP-007 | Cancel edit | Original bundle remains | 🖐 (cart untouched until Update) |
| COMP-008 | Update composition | Existing bundle replaced (same `compositionId`) | ✅ compositionStore · "COMP-006/008" |
| COMP-009 | Delete composition | Entire bundle removed | 🖐 |
| COMP-010 | Refresh browser | Composition persists | 🖐 |

## C. Promotion Engine

| ID | Scenario | Expected | Status |
|---|---|---|---|
| PROMO-001 | Composition only | 15% applied | ✅ promotions · "one rule" |
| PROMO-002 | Coupon only | Applied | ✅ (registry activation) |
| PROMO-003 | Coupon + Composition | Stack rules respected | ✅ promotions · "WELCOME10 does NOT stack" |
| PROMO-004 | Free Shipping + Composition | Both apply; shipping removed only | ✅ promotions · "Free Shipping stacks" |
| PROMO-005 | Expired / inactive coupon | Rejected | ✅ promotions · "PROMO-005" |
| PROMO-006 | Invalid coupon | No promo applied | ✅ promotions · "PROMO-006" |
| PROMO-007 | Priority determinism | Lower priority applies first | ✅ promotions · "determinism" |

## D. GST

### Intra-state (CGST + SGST)

| ID | Cart | State | Expected | Status |
|---|---|---|---|---|
| GST-001 | 1 candle | Maharashtra | CGST + SGST | ✅ commerce · "single product GST" |
| GST-002 | 3 bundle | Maharashtra | Discount **then** GST | ✅ "Discovery Composition" |
| GST-003 | Shipping ₹99 | Maharashtra | Shipping GST split | ✅ "shipping GST" |

### Inter-state (IGST)

| ID | Cart | State | Expected | Status |
|---|---|---|---|---|
| GST-010 | Candle | Karnataka | IGST | ✅ commerce · "inter-state" |
| GST-011 | Bundle | Karnataka | Discount then IGST | ✅ |
| GST-012 | Shipping | Karnataka | Shipping IGST | ✅ "shipping GST" (Karnataka) |

### Mixed / edge

| ID | Scenario | Expected | Status |
|---|---|---|---|
| — | Candle 12% + Room 18% + Linen 18% | Discount allocated **per line** → GST extracted **per rate** → summed (₹248.56, not the single-rate ₹203.25) | ✅ commerce · "mixed GST rates" |
| GST-004 | Room 18% + Candle 12% + ₹99 shipping | Shipping taxed at the **highest** rate (18%, composite supply) | ✅ commerce · "GST-004" |
| GST-005 | Fractional-tax items | Σ line taxes **exactly** = header tax (no 1-paisa drift) | ✅ commerce · "GST-005" |
| GST-006 | 100% discount (free order) | Taxable ₹0, GST ₹0, no shipping | ✅ commerce · "GST-006" |

## E. Shipping

| ID | Scenario | Expected | Status |
|---|---|---|---|
| SHIP-001 | Order ₹1,200 | ₹99 shipping | ✅ commerce · "free-shipping threshold" |
| SHIP-002 | Order ≥ ₹1,499 | Free shipping | ✅ |
| SHIP-003 | Invalid PIN | Error | ✅ checkout · "CK-009 / validation" |
| SHIP-004 | Shiprocket unavailable | Graceful fallback (flat estimate) | 🔷 |
| SHIP-005 | Service unavailable at PIN | Block checkout | 🔷 (Shiprocket serviceability) |

## F. Checkout Validation

| ID | Scenario | Expected | Status |
|---|---|---|---|
| CK-001 | Empty name | Error | ✅ checkout · "CK-001..005" |
| CK-002 | Invalid email | Error | ✅ |
| CK-003 | Invalid phone | Error | ✅ |
| CK-004 | Invalid PIN | Error | ✅ |
| CK-005 | State missing | Error | ✅ |
| CK-006 | Consent unchecked | Payment button disabled | 🖐 (button `disabled`) |
| CK-007 | Billing different | Second form appears | 🖐 |
| CK-008 | GSTIN invalid | Validation error | ✅ checkout · "CK-008" |
| CK-009 | PIN 110001 (Delhi) + Maharashtra | "PIN does not match selected state" | ✅ checkout · "CK-009" |
| CK-010 | Gift note > 200 chars | Blocked / validation error | 🔷 (gift UI later) |

## G. Razorpay

| ID | Scenario | Expected | Status |
|---|---|---|---|
| PAY-001 | Successful payment | Order created (by webhook) | 🔷 |
| PAY-002 | Payment cancelled | Cart retained | 🔷 (cart never cleared pre-payment) |
| PAY-003 | Payment failed | Retry available | 🔷 |
| PAY-004 | Retry payment | **Same** Razorpay order reused | ✅ orders · "retry reuses" (helper) |
| PAY-005 | Double-click Pay | One order only (idempotency key) | 🔷 |
| PAY-006 | Network failure | Safe recovery (webhook rescue) | 🔷 |

## H. Webhook

| ID | Scenario | Expected | Status |
|---|---|---|---|
| WEB-001 | `payment.captured` | Order confirmed | 🔷 |
| WEB-002 | Duplicate webhook | Ignored (idempotent) + logged | 🔷 (`UPDATE … WHERE idempotency_key IS NULL`) |
| WEB-003 | Delayed webhook | Order still updates | 🔷 |
| WEB-004 | Invalid signature | Rejected | 🔷 |
| WEB-005 | Timeout | Razorpay retries; still idempotent | 🔷 |
| WEB-006 | Amount mismatch (client altered payload) | `payload.amount ≠ db.total` → `failed_fraud`, stock released | 🔷 (server re-price contract) |
| WEB-007 | `refund.created` before `payment.captured` (race) | No crash; process payment first, then refund | 🔷 |

## I. Inventory

| ID | Scenario | Expected | Status |
|---|---|---|---|
| INV-001 | Reserve stock | Reservation created (`active`, `expiresAt`) | 🔷 |
| INV-002 | Reservation expires | Stock released (cron) | ✅ orders · "reservation expiry" (helper) |
| INV-003 | Payment success | Reservation → `consumed`, stock deducted | 🔷 |
| INV-004 | Payment failed | Reservation released | 🔷 |
| INV-005 | Last unit sold | Out of stock | 🔷 |
| INV-006 | Two users, stock=1, simultaneous checkout | A reserves; B "sold out during checkout" → back to cart | 🔷 |
| INV-007 | Bundle checkout, 1 component low | Reserves 1 unit of each of the 3 component SKUs | 🔷 |

## J. Orders

| ID | Scenario | Expected | Status |
|---|---|---|---|
| ORD-001 | Paid order | Status = Paid | 🔷 |
| ORD-002 | Cancelled | Status updated (cancellable ≤ `packed`) | ✅ orders · "cancellation window" (rule) |
| ORD-003 | Refund | Refund status (full/partial) | 🔷 |
| ORD-004 | Invoice | Generated `SAM/26-27/000001` on payment | ✅ orders · "invoice numbering" (format) |
| ORD-005 | Duplicate payment | No duplicate order | 🔷 |

## K. Email

| ID | Scenario | Expected | Status |
|---|---|---|---|
| EMAIL-001 | Order placed | Confirmation email | 🔷 (Phase 14 Resend) |
| EMAIL-002 | Shipment | Tracking email | 🔷 |
| EMAIL-003 | Refund | Refund email | 🔷 |

## L. Admin (immutability)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| ADM-001 | Change GST rate | Old orders unchanged (`taxVersion` snapshot) | ✅ commerce · money-safety (`taxVersion` stamped) |
| ADM-002 | Change price | Old invoices unchanged (line snapshot) | 🔷 (persist snapshot, Beat 2) |
| ADM-003 | Delete product | Existing orders intact (snapshot) | 🔷 |

## M. Security

| ID | Scenario | Expected | Status |
|---|---|---|---|
| SEC-001 | Price tampering | Server re-prices, rejects | 🔷 (server re-price contract) |
| SEC-002 | Discount tampering | Recalculated server-side | 🔷 |
| SEC-003 | Coupon tampering | Rejected | 🔷 |
| SEC-004 | Cart manipulation | Server validates (`computeOrderTotals` shared) | 🔷 |

## N. Bundle

| ID | Scenario | Expected | Status |
|---|---|---|---|
| BND-001 | 3 Glass | Valid | ✅ compositionStore · "BND-001" |
| BND-002 | 2 Glass | Invalid (no discount) | ✅ compositionStore · "BND-002" |
| BND-003 | 3 Ceramic | Valid | ✅ (same rule, any vessel) |
| BND-004 | Mixed vessels | Invalid | ✅ compositionStore · "BND-004" |
| BND-005 | Remove bundle | Entire bundle removed | 🖐 |
| BND-006 | Edit bundle | Loads current composition | ✅ compositionStore · "COMP-006/008" |

## O. Product

| ID | Scenario | Expected | Status |
|---|---|---|---|
| PDP-001 | Candle | Correct details | 🖐 |
| PDP-002 | Room Spray | Correct layout | 🖐 |
| PDP-003 | No related section when none | Section self-hides | 🖐 (Decision 25) |
| PDP-004 | Out of stock | Add to Cart disabled | 🔷 |

## P. Shop & Search

| ID | Scenario | Expected | Status |
|---|---|---|---|
| SHOP-001 | Filter by Chapter | Correct products (+ alias resolves) | ✅ shopPage · "SHOP-001" |
| SHOP-002 | Filter by Type | Correct products; vessel hidden for sprays | ✅ shopPage · "SHOP-002" |
| SHOP-003 | Combined Type + Chapter + Vessel | Correct products | ✅ shopPage · "SHOP-003" |
| SHOP-004 | Refresh | Filters persist in URL | 🖐 (URL-driven) |

## Q. Performance

| ID | Scenario | Expected | Status |
|---|---|---|---|
| PERF-001 | Homepage | < 2 s | 🖐 |
| PERF-002 | Shop | < 2 s | 🖐 |
| PERF-003 | Checkout | Smooth | 🖐 |
| PERF-004 | Mobile | Responsive | 🖐 |

## R. Edge Cases

| ID | Scenario | Expected | Status |
|---|---|---|---|
| EDGE-001 | Two tabs | Cart synchronized | 🖐 |
| EDGE-002 | Product removed during checkout | Error + refresh | 🔷 |
| EDGE-003 | Price changed during checkout | Server recalculates | 🔷 (server re-price) |
| EDGE-004 | Coupon expires mid-checkout | Inform customer | 🔷 |
| EDGE-005 | Inventory hits zero | Checkout blocked | 🔷 |

## S. Zero-Rupee & Gift Card

| ID | Scenario | Expected | Status |
|---|---|---|---|
| GC-001 | Gift card covers 100% | Total → ₹0; **bypass Razorpay**, confirm internally, fire webhooks/emails | ✅ commerce · "GC-001" (`requiresPayment(payable)===false`) |
| GC-002 | Gift card covers 50% | Razorpay charges the **exact remaining** balance | 🔷 (engine ready — `giftCard` slot) |
| GC-003 | Gift card + coupon | Both allowed: **discount first** (reduces tax), **gift card second** (acts as cash) | ✅ pipeline order (engine) · 🔷 gift-card UI |

---

## Future test areas (add sections as these ship)

Gift Cards · Loyalty Points · Wishlist · Corporate/B2B Orders · Subscription
Products · International Shipping · Multi-Warehouse · COD · Partial Refunds ·
Partial Shipments · Multi-Currency · Multi-Language.

## Running

```bash
npm test          # vitest run (CI / pre-release)
npm run test:watch
```
