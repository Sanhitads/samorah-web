# Stage 2B — Payment Pipeline Hardening (triage + checklist)

Three review sets (12 + 16 + 27) triaged, de-duplicated, and mapped to status.
Legend: ✅ done · 🟡 partial · 🔨 doing now · 📋 deferred (with reason).
Each item notes **validity** and **trade-off** so we build the right things in the
right order — the goal is *dependable under real-world conditions*, not feature count.

The three sets overlap heavily. Canonical themes below; every raw point is tagged
`S1.n / S2.n / S3.n` so nothing is lost.

---

## Cluster 1 — Immutability & versioning  (auditability)   ✅ DONE
The invoice/order must never change when the catalogue or config changes later.

- [x] **1.1 Order-item snapshots** — brand, product name, collection/chapter, volume, edition, vessel, size, HSN, GST rate, SKU, image URL, slug, unit price *(S1.1, S2.1, S3.16)*
      Valid ✅. +Historical invoices stay correct after renames/re-pricing. −More columns/write cost (negligible).
- [x] **1.2 Shipping snapshot** — method, charge, GST, rate version *(S1.2, S2.2)*
      Valid ✅. +Old orders unaffected by shipping-rate changes. −None material.
- [x] **1.3 Address snapshot in the order** *(S1.3, S2.3)* — `ship_*` columns, populated server-side.
      Valid ✅. +Editing the address book never mutates past orders.
- [x] **1.4 Config + tax version stamps** — commerce_version, tax_version, pricing_version *(S1.4, S2.4)*
      Valid ✅. +Order is self-describing; disputes resolvable against the exact rules in force. −None.
- [x] **1.5 Cart hash** — SHA-256 of {sku, qty, unit, discount, shipping, GST, payable} *(S3.9)*
      Valid ✅. +Fraud/debug fingerprint; detects client tampering post-hoc. −Must be computed server-side only.
- [x] **1.11 Invariant test: engine totals == persisted payload (INV-P07)** *(S1.11)*
      Valid ✅. +Locks snapshot ≡ engine; catches drift at build time. −None. (4 tests, paise-exact.)
- [x] **1.6 Publish/active lock at reprice** — reject if `product.status≠active` or no active variant *(S3.2, S3.5 partial)*
      Valid ✅. +No payment for archived/unpublished items. −Adds a status check (already fetching the row).

## Cluster 2 — Integrity & audit at finalize   ✅ DONE
- [x] **2.5 `payment_attempts` table** — retries never overwrite prior attempts *(S1.5, S3.11 rel.)*
      Valid ✅. +Full retry history; supports fraud + support. −New table + writes. (Append-only via `record_payment_attempt`, dedup on payment id; verify/webhook/failed all logged.)
- [x] **2.8 Order state machine** — allowed transitions only *(S1.8, S2.9, S3.24)*
      Valid ✅. +No illegal jumps (pending→delivered); safe admin ops. −Must thread through every status write. (`lib/orderState.ts`, 5 tests; models the real `order_status` enum.)
- [x] **2.9 Amount/currency/merchant/order-id validation before finalize** *(S1.9, S2.13/14/15)*
      Valid ✅. +Defends against callback spoofing/mis-config. −One extra Razorpay fetch in finalize. (`validateRazorpayPayment` checks order-id/currency/status; in-txn amount guard in `finalize_order`; **explicit merchant guard** in the webhook via `RAZORPAY.accountId` vs `event.account_id` when configured. Mismatch → no finalize + audit row.)
- [x] **2.6 Webhook log fields** — event id, payment id, verified flag, timestamps, processing ms; **never** secrets/HMAC *(S1.6, S2.6, S3.14 rel.)*
      Valid ✅. +Clean audit trail. −Tiny schema add. (Added `verified`, `processing_ms`; store body only, never the signature header. Invalid-signature events now logged too.)
- [x] **2.10 Thank-You signed token** — guests view only their own order *(S1.10, S2.12)*
      Valid ✅. +No IDOR/enumeration of orders. −Token plumbing (HMAC). (`lib/orderToken.ts` HMAC capability token; page is token-gated, `?e=` removed.)

## Cluster 3 — Inventory & failure isolation   ✅ DONE
- [x] **3.12 Atomic reservation consume** — concurrent payments can't oversell *(S1.12, S2.16)*
      Valid ✅ (critical). +No oversell. −Requires reservation creation at checkout first. (`reserve_stock` two-pass row-lock holds at create-order; `finalize_order` decrements `variants.stock` + deletes holds in the same txn; idempotency → never double-decrements.)
- [x] **3.1 Inventory re-validation before create-order** *(S3.1, S3.5)*  Valid ✅. +Stops paying for sold-out items. (Reserve step re-checks availability + `variant.is_active`; `repriceCart` re-checks `product.status='active'`. OOS → HTTP 409, no Razorpay order.)
- [x] **3.7 Fulfillment ordering** persist→consume→commit→**queue** email→**queue** Shiprocket; externals never block webhook *(S1.7, S2.7, S2.10/11)*
      Valid ✅. +Fast webhook, no payment rollback on Shiprocket/email failure. −Needs a job/queue table. (`fulfillment_jobs` + `queue_fulfillment_job`; enqueued post-commit, idempotent; worker is a later phase.)
- [x] **3.x Payment/pending timeout** → expire + release reservation after ~30 min *(S3.11)*  Valid ✅. (`release_expired_reservations` + `expire_stale_pending_orders` RPCs; `/api/cron/reservations` guarded by `CRON_SECRET`.)

## Cluster 4 — Post-order surface   📋 LATER (own phases)
- [ ] Invoice PDF generated once + stored + re-downloadable *(S3.6, S3.7)*
- [ ] Webhook monitoring dashboard *(S3.14)*
- [ ] Guest → account order merge *(S3.13)*
- [ ] Analytics events (GA4/Meta): checkout/payment/order/composition *(S3.20)*
- [x] UTM capture into the order *(S3.22)*  — DONE. `UtmCapture` (app-wide, last-touch) → localStorage → checkout → `orders.utm_*`.
- [x] Razorpay `notes` metadata *(S3.8)* — DONE. order notes carry cart_hash, tax/promotion/commerce versions, composition ids.
- [ ] Soft-delete products (archive, never DELETE) *(S3.15)* — mostly policy; enforce in admin.
- [ ] Fraud velocity checks (failed attempts by IP/phone/card) *(S3.10)*
- [ ] Central order timeline / event log (one stream) *(S3.26, S1.7 rel.)*
- [ ] Admin manual payment (bank/UPI/cash) *(S3.12)*
- [ ] Multi-currency architecture *(S3.19)*, gift wrap *(S3.18)*, gift message snapshot *(S3.23)*, recovery emails *(S3.21)*, internal notes UI *(S3.17)*

## Already shipped earlier
- [x] Canonical domain + alias 301 + canonical URLs/metadata/robots/sitemap *(S3.27)* — `config/site.ts`, middleware.
- [x] Server re-prices; client amount never trusted; Razorpay amount = server payable.
- [x] Cross-surface invariant tests (Cart==Checkout==create-order).
- [x] Idempotent `persistOrder()` shared by verify + webhook.

---

### Why this order
Immutability (C1) is the cheapest, highest-value auditability win and unblocks the
invariant proof. Integrity-at-finalize (C2) hardens the trust boundary. Inventory
(C3) is critical but depends on reservations existing at checkout. C4 items are
real but belong to their own phases (invoice PDF, analytics, admin) and several are
explicitly marked "future" in the review.
