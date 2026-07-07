# SAMORAH — Payment Flow (Razorpay · Beat 2)

> The locked payment/order flow. Contracts + types exist today; wiring lands in
> Beat 2. **The webhook is the single source of truth** — no business logic runs
> on the client after payment success.

## Prerequisites (Beat 2)

- `npm i razorpay`
- Env: `NEXT_PUBLIC_RAZORPAY_KEY_ID` · `RAZORPAY_KEY_SECRET` · `RAZORPAY_WEBHOOK_SECRET`
  (referenced via `config/commerce.ts` `RAZORPAY`).
- Confirm `COMMERCE.gstin` + `registeredState`.
- Orders/order_items/webhook_logs/stock_reservations tables wired (schema exists).

## The flow (never deviate)

```
Cart (client)
  │  submit address + consent
  ▼
Server RE-VALIDATES totals + promotions        ← never trust the client
  │   · composition still exactly 3, same vessel, eligible → else drop 15% + error
  │   · re-price via computeOrderTotals (SAME engine) → payable
  │   · stock available → StockReservation (active, 15-min TTL)
  ▼
payable === 0 ?
  ├─ yes → confirm order INTERNALLY (bypass Razorpay), go to "webhook side-effects"
  └─ no  → continue
  ▼
Server creates (or REUSES) a Razorpay order    ← canReuseRazorpayOrder on retry
  │   amount = payable (paise)
  ▼
Customer pays (Razorpay Checkout)
  ▼
Webhook  (payment.captured)  = ORDER SOURCE OF TRUTH
  │   · verify signature (RAZORPAY_WEBHOOK_SECRET)      → invalid ⇒ reject (WEB-004)
  │   · IDEMPOTENT: UPDATE … WHERE idempotency_key IS NULL → branch on rows affected
  │       duplicate ⇒ silent 200, no double side-effects (WEB-002)
  │   · amount check: payload.amount === db.order.total  → mismatch ⇒ failed_fraud,
  │       release stock (WEB-006)
  ▼
Persist order  (immutable paise snapshots + taxVersion/pricingVersion/commerceVersion)
  ▼
Allocate FY invoice number  (per-FY sequence, in the same txn)
  ▼
Reservation → consumed;  deduct stock
  ▼
Create Shiprocket shipment  (serviceability/rate by validated PIN→state)
  ▼
Send confirmation email  (React Email + Resend)
  ▼
Thank-You page reads the SERVER-CONFIRMED order  →  NOW clear the cart
```

## Cart-clearing lifecycle (non-negotiable)

The cart is a recovery buffer until an order provably exists. It is cleared at
**exactly one point**: the Thank-You page, after it has read the order the
**webhook** persisted. Never on popup-open, never in the success `handler`
callback, never on `/verify`.

```
Payment failed     → cart remains exactly as-is
Payment cancelled  → cart remains exactly as-is
Payment successful → webhook verifies → order persisted → invoice → stock
                     committed → Thank-You page → THEN clear cart
```

Why: the browser success callback is not proof of an order. Clearing on popup-open
or on `handler` risks *money charged, no order, empty cart* — unrecoverable for the
customer. Clearing only against a persisted order keeps the bag recoverable through
every failure path.

## Client rules

- `/verify` (if used) **only redirects** — it performs no side effects.
- **Cart is never cleared before the webhook persists the order.** On
  cancel/failure the customer keeps their bag and can retry / edit address /
  continue shopping (`PAY-002/003`).
- **Stage 2A note:** payment success shows an acknowledgement only; the cart is
  intentionally left intact because no order is persisted yet.
- **Double-click Pay** → one order (idempotency key) (`PAY-005`).

## Idempotency & races

- Razorpay resends webhooks — the idempotency key makes replays a no-op (`WEB-002`).
- `refund.created` arriving before `payment.captured` (rare race) → log, process
  payment first, then refund; never crash (`WEB-007`).

## Failure → recovery

| Failure | Recovery |
|---|---|
| Payment cancelled | Cart retained; retry available |
| Payment failed | Reuse the SAME Razorpay order on retry (`canReuseRazorpayOrder`) |
| Network drop after pay | Webhook rescue — order still confirms |
| Amount mismatch (tamper) | `failed_fraud`, stock released |
| Reservation TTL elapsed | Cron releases stock; customer re-checks out |

See `COMMERCE_TEST_MATRIX.md` §G/H/I for the acceptance checklist.
