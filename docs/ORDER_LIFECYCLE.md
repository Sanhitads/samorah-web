# SAMORAH — Order Lifecycle

> Statuses, payment states, the audit timeline, reservations, cancellation, and
> refunds. Types + pure helpers in `lib/orders.ts`; runtime transitions land in
> Beat 2 (the webhook is the only writer).

## 1. Order status

```
pending_payment → paid → packed → shipped → delivered
                     ↘ cancelled
                     ↘ refund_requested → refunded
```

`OrderStatus` = `pending_payment · paid · packed · shipped · delivered · cancelled
· refund_requested · refunded`.

## 2. Payment status (distinct — never lumped)

`pending · created · authorized · captured · failed · expired · refunded`.

- **Pending / Failed / Expired** are separate so retry logic is correct.
- **Retry reuses the open order**: `canReuseRazorpayOrder()` → reuse the existing
  Razorpay order while payment is `pending`/`failed`; never mint a duplicate
  (`PAY-004`).
- **Zero-rupee** (`requiresPayment(payable) === false`): confirmed internally,
  Razorpay skipped (`GC-001`).

## 3. Audit timeline (append-only)

Every order keeps an event log for debugging. `OrderEventRecord` =
**id (uuid) · event · at (timestamp) · actor · payload**.

Events: `created → validated → payment_started → webhook_received →
invoice_generated → shipment_created → delivered → refunded`.

Actors: `customer · system · webhook · admin`. Written at each transition (the
webhook adds `webhook_received` / `invoice_generated`, etc.).

## 4. Stock reservations (15-minute hold)

`StockReservation` = variant · qty · status (`active · released · consumed`) ·
`expiresAt` (= created + `RESERVATION_TTL_MINUTES`).

```
create-order        → reservation active (expiresAt set)
payment success     → consumed  → stock deducted
TTL elapsed, no pay → released  → stock returned   (cron: release-expired-reservations, ~5 min)
```

Helpers: `reservationExpiry()`, `isReservationExpired()`. Bundle checkout reserves
one unit of each of the 3 component SKUs (`INV-007`). Concurrency: two users, stock
1 → A reserves, B gets "sold out during checkout" (`INV-006`).

## 5. Cancellation window

`canCancel(status)` — the customer may cancel up to (and including)
`COMMERCE.policy.cancellableUntil` (currently **`packed`**); not after `shipped`
(`ORD-002`).

## 6. Refunds — full or partial

`Refund` = type (`full · partial`) · amount (paise) · reason · lines (for partial) ·
status (`requested · processing · processed · failed`). An order holds `refunds[]`.

## 7. Shipments — partial supported

`Shipment` = courier · awb · items (subset of order lines) · status (`created ·
in_transit · delivered · rto`). An order holds `shipments[]` — never assume one
shipment forever (`INV-007`, partial fulfilment).
