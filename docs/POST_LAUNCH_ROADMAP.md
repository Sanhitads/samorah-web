# Post-Launch Roadmap

Features deliberately **deferred** from the launch-critical Orders build, grouped by priority. The
launch scope was strictly additive and non-destructive; anything touching accounting, customer money,
approvals, or destructive bulk actions was held back on purpose.

Each entry records: **why deferred · dependencies · complexity · recommended phase.**
Complexity: **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks · **XL** ≈ 3+ weeks.

> **Architecture note.** Several "advanced operations" below **already exist in the incident domain**
> (`config/incidents.ts` + `lib/incidents/engine.ts` + `services/incidentService.ts`): runbooks,
> escalation policy, suppression rules, maintenance windows, confidence score, dependency graph,
> auto-assignment, dynamic thresholds. For those the work is **exposing them / extending to orders**,
> NOT building from scratch — noted per item so nobody rebuilds a parallel system.

---

## P0 — Finance (highest risk; needs a ledger + reconciliation)

These move real money or change legal/tax records. None should ship without double-entry accounting,
idempotency, and reconciliation — the reason they were all held back.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Coupon Ledger** (release on cancel) | `cancel_order` does not decrement `coupons.used_count` today; the honest cancel impact preview labels this "not auto-released". Needs an idempotent, auditable release (a retried cancel must not double-release). | `coupons` table (exists), cancel flow (exists) | M | Finance-1 |
| **Loyalty Ledger** (points reversal on cancel/refund) | `loyalty_transactions` table exists but has **no earn/redeem/reversal code**. Reversing points needs the whole ledger live first, plus tier recompute. | `loyalty_transactions` (exists, unused), `users.loyalty_points` | L | Finance-1 |
| **Invoice Void** | Cancelling a paid order leaves the tax invoice live (impact preview flags "void manually"). GST-compliant voiding needs a credit-note sequence + reporting, not a soft delete. | invoice sequence (exists), GST config | L | Finance-2 |
| **Store Credit** | A refund method the refund dialog lists as unsupported. Requires a stored-value ledger with expiry, idempotent debit/credit, and fraud controls. | new `store_credit` ledger, refund flow (exists) | XL | Finance-2 |
| **Customer Wallet** | Superset of store credit (top-ups, multi-currency, statements). Only after store credit is proven. | Store Credit | XL | Finance-3 |
| **Accounting Ledger** | Double-entry GL to reconcile payments/refunds/credits with the gateway + bank. The backbone the above should post into. | all of the above | XL | Finance-3 |

---

## P1 — Approvals (maker-checker before money leaves)

The refund path is capability-gated but single-actor. Large or sensitive refunds should require a
second approver. Held back because it needs a durable approval state machine + notifications.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Refund Approval Workflow** | Refunds settle immediately today. Threshold-based hold → approve/reject needs a pending state + queue. | `refunds` ledger (exists), notification engine (exists) | L | Approvals-1 |
| **Maker–Checker** | Generic "requester ≠ approver" enforcement across refund/cancel/write actions. | RBAC (exists), audit stream (exists) | M | Approvals-1 |
| **Manager Approval** | Role-scoped approver routing (manager tier). | Maker–Checker, RBAC | S | Approvals-2 |
| **Finance Approval** | Finance-tier approver for high-value / GST-affecting actions. | Maker–Checker, Finance ledgers | M | Approvals-2 |

---

## P2 — Customer Communication

Structure exists (the cancel/refund dialogs already collect channel intent; email is live for
cancellation). Deferred pieces need provider onboarding or new templates.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **SMS (customer)** | Ops SMS via MSG91 exists; there is **no customer-facing SMS template/flow** yet (DLT templates needed). | MSG91 (configured for ops), DLT template approval | M | Comms-1 |
| **WhatsApp** | Needs a dedicated WhatsApp Cloud number (pending) + template approval. The dialogs already show the channel as "soon". | WhatsApp Cloud number, template approval | M | Comms-1 |
| **Refund Attachments** | Finance wants to attach approval proof / invoices to a refund. Needs a storage bucket + a `refunds` attachment column + access control. | Supabase Storage bucket, additive `refunds` column | M | Comms-2 |
| **Rich Customer Notifications** | Branded, itemised refund/return/dispatch emails beyond the current transactional set. | React Email templates (exist), notification engine (exists) | M | Comms-2 |

---

## P3 — Bulk Actions (destructive — explicitly out of launch scope)

Non-destructive bulk actions ship at launch (assign, priority, tags, note, export, link incident,
flags). The destructive ones are deferred behind stronger guards (confirmation + reason + rate limit
+ per-record audit + partial-failure isolation).

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Bulk Cancel** | Cancels money-bearing orders en masse — needs per-order refund decisions + typed confirmation + full audit. | cancel flow (exists), bulk framework (launch) | M | Bulk-1 |
| **Bulk Refund** | Moves money in bulk — must wait for Approvals (P1) + idempotency. | Approvals, refund flow (exists) | L | Bulk-2 |
| **Bulk Ship** | Mass shipment creation / AWB assignment — needs courier rate limits + rollback. | shipment domain (exists), bulk framework | M | Bulk-1 |

---

## P4 — Advanced Operations

Most of these **already exist for the incident domain** — the deferral is exposing them in the UI or
extending them to orders, not new engines.

| Feature | Status today | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|---|
| **Auto-Assignment Rules** | `matchAutoAssign` exists (incidents) | Extend rule engine to orders + a rules admin UI | incident engine | M | AdvOps-1 |
| **Runbooks** | `INCIDENT_RUNBOOKS` exist | Author order-level runbooks + surface them | incident config | S | AdvOps-1 |
| **Maintenance Windows** | `maintenanceActive` exists | Admin UI to define windows; wire to order alerting | incident engine | S | AdvOps-2 |
| **Suppression Rules** | `suppressionMatches` + `suppression_rules` table exist | Admin UI + apply to order health noise | incident engine | S | AdvOps-2 |
| **Recovery Detection** | Auto-replay / recovery exists (notifications) | Generalise recovery signals to order health | notification engine | M | AdvOps-2 |
| **Dynamic Thresholds** | `effectiveThreshold` exists | Per-metric tuning UI | incident engine | M | AdvOps-3 |
| **Incident Merge** | not built | Merge duplicate incidents into one | incident domain | M | AdvOps-3 |
| **Incident Split** | not built | Split a mis-correlated incident | incident domain | M | AdvOps-3 |
| **Confidence Score** | `computeConfidence` exists | Surface score in UI + tune | incident engine | S | AdvOps-2 |
| **Simulation / Dry-run Mode** | partial (retry verification is dev-only) | Safe "what-if" for rules/thresholds without side effects | incident + notification engines | L | AdvOps-3 |
| **Dependency Graph** | `DEPENDENCY_NODES/EDGES` + `dependencyDownstream` exist | Interactive graph UI + order impact mapping | incident config | M | AdvOps-3 |

---

## Deferred from this session's cancel/refund work (cross-reference)

- **Store-credit / coupon refund methods** in the refund dialog → P0 Finance (Store Credit, Coupon Ledger).
- **Coupon release / loyalty reversal / invoice void on cancel** → the cancel impact preview labels
  these "not automated ⚠" precisely because they land in P0 Finance. The preview stays honest until
  the ledgers exist.
- **Customer SMS/WhatsApp** on cancel/refund → P2 Communication.

---

## Guardrails for every deferred item (when it's built)

Per the launch rules, each future feature must ship with: unit + integration + permission + audit +
regression tests; no N+1 / no duplicated joins; reuse of the existing Incident / Notification /
Refund / Shipment / Audit domains; **no parallel systems**; real (non-mocked) business logic.

---

## Technical Debt

### Integration Test Harness

**Reason.** The project's current test coverage is: **unit tests** (pure logic — health precedence,
bulk validation, tag math, flag badges, money/GST), **service tests** (pure service helpers), **live
verification** (query shapes checked directly against the DB), and **manual QA**. There is no
harness that spins up a database and asserts flows end-to-end.

**Future.** Add automated **database-backed integration tests** (seed → act via the real
services/APIs → assert DB state + audit events + permission gates).

**Priority: Medium.** Not launch-blocking — the unit + service + live-verification + manual-QA layers
cover the launch surface; this hardens regression safety as the codebase grows.

---

## P5 — Warehouse Operations (Fulfillment)

Advanced warehouse automation, deferred from the launch fulfillment build. The launch scope covered
SLA, search, filters, analytics, structured hold reasons, shipping milestones, pick progress, packing
checklist, QC record, and safe bulk ops — everything an operator needs to run the floor by hand.
These items automate/optimise that floor and need hardware, algorithms, or data we don't have yet.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Batch Picking Optimization** | Group orders sharing SKUs into one walk. The *bulk start-picking* primitive ships at launch; the *optimization* (which orders to batch, in what order) needs a real algorithm + volume to be worth it. | pick data (launch), warehouse locations (below) | L | WhOps-1 |
| **Route Optimization** (pick path) | "Shelf A → B → C" walking path needs **warehouse bin/rack/shelf locations, which don't exist** (see Dependency below). Blocked until location data is modelled + populated. | **Warehouse Location data** | L | WhOps-2 |
| **Barcode Scanner Integration** (scan verification) | Scan product → confirm it matches the order → reduce mis-picks. Needs scanner hardware + a scan-verify flow + SKU/barcode wiring (variants have `barcode`, unused). | scanner hardware, `variants.barcode` wiring | M | WhOps-1 |
| **RFID** | Tag-level tracking. Hardware + tag economics only justified at scale. | RFID hardware/tags | XL | WhOps-3 |
| **Warehouse Heat Maps** | Visualise pick density by location. Needs location data + enough pick history. | Warehouse Location data, pick history | M | WhOps-3 |
| **AI Pick Optimization** | ML-driven pick sequencing/slotting. Needs location data + a large pick-event history to train on. | Warehouse Location data, pick history at volume | XL | WhOps-3 |
| **Wave Picking** | Release work in timed waves by courier cutoff. Needs volume + cutoff modelling to matter. | courier cutoffs, volume | L | WhOps-2 |
| **Voice Picking** | Hands-free pick instructions. Hardware + integration; only pays off at scale. | voice hardware, WMS integration | XL | WhOps-3 |
| **Warehouse Robotics** | Automated storage/retrieval. Major capex; far-future. | robotics hardware/capex | XL | WhOps-3 |

### Dependency: Warehouse Location data (blocks several of the above)

**Status: does not exist.** There is **no bin/rack/shelf/aisle location** stored for any product or
variant anywhere in the schema — not on `variants`, `products`, or any inventory table (there is no
`warehouse_inventory`/`stock_location` table; stock is a single scalar `variants.stock`). The Phase-3
"show warehouse location" board feature and the location-dependent optimizations above (route
optimization, heat maps, AI pick) are **blocked on this**.

**To unblock:** add per-variant location — a column on `variants` for single-warehouse, or a
`variant_locations` (variant × warehouse → bin/rack/shelf) table for multi-warehouse — then populate
it (a real warehouse-mapping exercise, not just a migration). **Complexity: M** (schema) **+ ongoing
data entry. Recommended phase: WhOps-1** (it gates the rest).

---

## P6 — Returns (Resolution Center follow-ons)

The launch build turns Returns into a Resolution Center (resolution outcomes, evidence review,
expanded lifecycle, return timeline, inspection, warehouse disposition, internal/customer notes,
damage classification, refund method). These extend it further and need customer-facing surfaces,
ML, courier integrations, or the finance ledger.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Customer self-service return portal** | Customers raise/track returns + upload evidence themselves. Needs an authed storefront flow + the evidence store the admin side already reads from. | auth (exists), evidence store, storefront | L | Ret-1 |
| **Customer return tracking** | Customer-facing status of their return. Rides on the portal. | Customer portal | M | Ret-1 |
| **AI image analysis / auto damage detection** | Classify damage from photos. Needs an ML pipeline + a labelled dataset — explicitly out of launch scope. | evidence at volume, ML infra | XL | Ret-3 |
| **Fraud / return-abuse scoring** | Flag serial returners / abuse. Needs return history at volume + a scoring model. | return history, model | L | Ret-3 |
| **Automatic approval rules** | Auto-approve low-risk returns. Needs the fraud signal + a rules engine (reuse the incident rule engine). | fraud scoring, rules engine | M | Ret-2 |
| **Return shipping labels / return AWB** | Generate a reverse label + AWB for the customer. Needs a courier reverse-pickup integration (Shiprocket etc.). | courier integration | M | Ret-2 |
| **Courier pickup automation** | Auto-book reverse pickup on approval. | Return AWB, courier API | M | Ret-2 |
| **Warehouse barcode scanning / image capture** | Scan the returned item; capture inspection photos at the bench. Needs scanner/camera hardware + the evidence store. | hardware, evidence store, warehouse locations | M | Ret-3 |
| **Supplier / vendor RMA** | Route "return to vendor" dispositions to a supplier RMA flow. Needs a suppliers domain (doesn't exist). | suppliers domain | L | Ret-3 |
| **Store Credit ledger** | The disabled refund method. Needs a stored-value ledger (also blocks orders' store-credit refunds) — see P0 Finance. | Store Credit ledger (P0) | XL | Finance-2 |
| **Return approval workflow (maker-checker)** | Second approver for high-value refunds/waivers. Reuse the orders approval workflow (P1 Approvals). | Approvals (P1) | M | Approvals-2 |
| **Partial-exchange automation** | Auto-create the exchange order + price-difference charge. Needs order-linking + payment top-up. | order creation, payment | L | Ret-2 |
| **Return analytics dashboard** | Return rate, reasons, damage reports, product-return %, customer-return %, fraud analytics. Needs aggregation + enough return volume to be meaningful. | return volume, analytics infra | M | Ret-2 |
| **Similar-returns / customer history panel** (review P8) | Side panel on the return detail: this customer's last-12-months returns, return %, fraud %, a customer score. Needs return history at volume + the fraud signal. | return history, fraud scoring | M | Ret-3 |
| **Product return-history panel** (review P9) | "This fragrance has been returned N times" beside the item — a QC signal. Needs product-level return aggregation. | return volume, analytics infra | M | Ret-3 |
| **Evidence image annotation** (review P10) | Draw circle/arrow/highlight on an evidence photo (mark the crack) and save the markup. Needs a canvas annotation layer + a place to persist the overlay. | evidence store, annotation UI | M | Ret-3 |
| **Return SLA timeline** (review P11) | Requested → Review → Pickup → Received → Refund with elapsed time per hop + breach flags. Reuse the fulfillment SLA approach; the audit timeline already carries the timestamps. | SLA config, audit timestamps (exist) | S | Ret-2 |

**Shipped in the launch build (review priorities 1–7, 12 — UI/UX polish, no architecture change):**
resolution colour badges, expanded finance summary (customer paid / returned-goods value / refund +
derived GST split / store credit / replacement value / net cash out), a persistent resolution *reason*,
an accountability panel (who approved / resolved / inspected / dispositioned / refunded, from the audit
stream), an evidence count badge, timeline event icons + resolved staff names, and collapsible section
groups. Deferred cost analytics (unit COGS + reverse-logistics cost) is the only part of the finance
"cost impact" ask that needs new data — it rides on the analytics/finance work above.

**Note on evidence:** the launch build reads customer evidence from a return-attachments store that CS
attaches to (e.g. photos a customer emails in). The customer self-service *upload* path (Ret-1) writes
to that same store — no rework, just a new writer.
