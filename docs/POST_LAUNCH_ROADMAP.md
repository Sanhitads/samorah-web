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

## P7 — Shipments (post-dispatch maturity follow-ons)

The launch build brings Shipments to the operational maturity of Orders/Fulfillment/Returns: global
search + filters, a morning analytics strip (today / in transit / out for delivery / delivered / RTO /
exceptions / avg delivery time), safe bulk operations (mark in transit / out for delivery / delivered,
assign courier, print labels, packing slips, export manifest — **never** bulk RTO/exception), a
clickable-AWB shipment detail page (summary, courier, cost breakdown, weight + dimensions, tracking
history, exception history, internal notes, POD placeholder, ship-to), per-parcel SLA + health badges,
status icons + courier branding, and an RTO confirmation with reason. These extend it further and need
courier integrations, capture hardware, or ML.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Courier performance dashboard** (review P8) | Per-courier avg delivery, exception %, RTO %, on-time %. The data (delivered_at, statuses, SLA) is already captured per shipment — this is the aggregation view. Needs enough volume + a real multi-courier mix to be meaningful. | shipment volume, real couriers, analytics infra | M | Ship-2 |
| **Proof of delivery capture** (review P11) | Signature + delivery photo on the shipment, not just delivered-to text. Needs a courier webhook that returns POD assets (or a capture app) + the media store. Detail page already shows an "Awaiting POD" placeholder. | courier integration / capture app, media store | M | Ship-2 |
| **Real courier integration (Shiprocket/Delhivery/BlueDart)** | Live AWB, label PDFs, pickup booking, and a tracking webhook feeding the same state machine. The provider abstraction + status map already exist; this wires a real provider behind them. | provider API keys, webhook infra (exists) | L | Ship-1 |
| **Barcode / scan-based warehouse routing** | Scan a parcel to advance its status at the bench. Needs scanner hardware + a scan endpoint. | hardware, scan endpoint | M | Ship-3 |
| **Automatic courier selection / allocation** | Pick the cheapest/fastest serviceable courier per parcel from live rates. Needs multi-courier serviceability + rate APIs. | multi-courier rates, serviceability | L | Ship-3 |
| **Delivery ETA prediction** | Predicted delivery date per parcel. Needs historical lane data + a model. | delivery history at volume, model | XL | Ship-4 |
| **Route optimization / multi-warehouse routing** | Optimal dispatch routing across warehouses. The warehouse-routing service exists (region rules); this is the optimization layer. | multi-warehouse volume, optimizer | XL | Ship-4 |
| **GPS / live customer tracking + delivery heat maps** | Real-time parcel GPS, a customer live-tracking view, and delivery-density heat maps. All need courier GPS feeds. | courier GPS feed | XL | Ship-4 |
| **Per-courier / per-zone SLA table** | Replace the single flat transit target with a courier × zone matrix (a metro is not the North-East). The SLA helper is already isolated + pure — swap the constant for a table. | zone data, courier SLAs | S | Ship-2 |

**Shipped in the launch build (review priorities 1–7 + P2 items + UI improvements):** search, filters,
analytics strip, safe bulk ops, clickable-AWB detail page, tracking-history + audit timeline, SLA
badges, shipment health badges, internal notes (audit-backed), status icons, courier branding labels,
expanded cost breakdown, CSV/manifest + labels + packing-slip exports, RTO confirmation with reason,
and an exception button that reads neutral until an exception exists. No schema change — notes use the
audit stream, everything else derives from columns already present.

## P8 — Customers / CRM (Customer 360 follow-ons)

The launch build makes Customers an operational CRM: analytics strip, search + filters, customer
health, a Customer 360 profile (financial summary, returns & risk, communication history, per-channel
consent display, customer journey, timeline, notes, tags, operational flags), plus list refinements
(avatars, name badges, spend tier, last activity, quick actions, support summary). These extend it
further and need new subsystems, tracked preferences, or volume to be meaningful.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Internal CRM tasks / reminders** (review 5) | Staff-set follow-up reminders ("call after 25 days", assigned to X) with a due date + a today view. NOT marketing automation — internal only. Needs a `crm_tasks` table + an assignee/notify surface. | new table, assignment + notification (exists) | M | CRM-1 |
| **Communication preference** (review 7) | "Prefers WhatsApp / Email / Calls" per customer, surfaced to support. Needs a stored preference (customer-set or staff-set) — not tracked today. | preference column/table | S | CRM-1 |
| **Per-channel consent management** (review, prior round) | The consent panel is display-only and only email consent is stored. Editable SMS/WhatsApp/Push consent needs per-channel columns + a DPDP-compliant capture + audit. | per-channel consent columns, capture flow | M | CRM-2 |
| **Friendly customer number** (review 10A) | A sequential, human "CUS-000014" reference instead of the UUID prefix support quotes today. Needs a per-customer sequence column + backfill. | `customer_number` sequence, backfill | S | CRM-1 |
| **Review-submitted journey milestone** | The lifetime timeline can include "Review submitted" once the `reviews` domain is populated + wired (table exists, empty at launch). | reviews at volume | S | CRM-2 |
| **Open tickets in the support summary** | The support card shows Open Tickets as "—" because there is no ticketing system. Wire it when/if a helpdesk (Zendesk/Freshdesk/internal) lands. | ticketing system | M | CRM-3 |
| **Customer cohorts / acquisition analytics** | Monthly acquisition cohorts, retention curves. Needs aggregation + enough history. | customer volume, analytics infra | M | CRM-3 |
| **Purchase-frequency + fragrance analytics dashboards** | Store-wide preference analytics beyond the per-customer heat already shown. | volume, analytics infra | M | CRM-3 |
| **Geographic customer heatmap** | Delivery/customer density maps. Needs a map layer + geocoding. | map layer, geocoding | L | CRM-3 |
| **Last-viewed / browse tracking** | "Recently viewed products" on the profile needs storefront view-event capture (the profile already notes this is planned). | storefront analytics events | M | CRM-2 |

**Explicitly NOT for launch (review 8) — a considered "no", not an oversight:** loyalty program, rewards
engine, referral analytics, AI segmentation, AI recommendations, churn prediction, customer-scoring
models, marketing-campaign builder, and CRM automation. These belong in a dedicated CRM/marketing
product once there is meaningful customer data, and were deliberately excluded to keep the admin an
operations tool, not a marketing platform.

**Shipped in the customer launch build:** analytics strip (total / new / returning / VIP / newsletter
/ wholesale / avg LTV), advanced search (name / email / phone / id / order # / city) + filters
(segment / health / newsletter / wholesale / LTV / orders / recency), customer health, list columns
(last order + amount, AOV, customer since, last activity), avatars, priority name-badges, repeat +
spend-tier badges, row quick actions (call / WhatsApp / email), and a Customer 360 with a support
summary card, financial summary, returns & risk, address card, communication history, per-channel
consent (display), product/fragrance preference, a merged Customer Lifetime Timeline, notes, tags,
and derived operational flags. No schema change — everything derives from users + orders + returns +
shipments + notification_dispatches + incidents.

## P9 — Products / Editorial CMS (follow-ons)

The launch build evolves Products from a CRUD screen into an editorial CMS: a rich list (analytics
strip, search, filters, sort, thumbnail/collection/sales/updated columns, quick featured+status), and
a collapsible editor exposing the storefront content that already lived in the DB but wasn't editable
— Collection/Chapter + position, merchandising flags (featured/hero/best seller/new arrival/limited/
seasonal/staff pick/coming soon), visibility controls, story (short+long), flame persona, mood tags,
lifestyle, centre quote, ingredients (wax/wick/burn), a Fragrance Journey editor (Top/Heart/Base), an
image gallery (add/hero/alt/reorder/delete), SEO (title/description/OG/canonical + Google preview),
and scheduled publish. These extend it further.

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Per-product Artist Story** | Today the artist block is global `config/artist.ts`. Making it per-product (name/story/image/quote/enabled) needs product columns + a migration + moving the PDP builder off config. | product columns, PDP builder change | M | Prod-1 |
| **Testimonials per product** | Currently per-chapter `config/testimonials.ts`. Per-product needs a `product_testimonials` table + editor. | new table | M | Prod-2 |
| **Continue-the-Chapter manual picker / related products** | The `related_products` table exists but is empty; related is derived from the collection today. A manual picker (related / upsell / cross-sell / pairs-with) needs the table wired + an editor. | related_products schema + editor | M | Prod-1 |
| **Structured ingredients** (vessel / fragrance % / origin) | Wax + wick are editable; the richer breakdown needs columns. | product columns | S | Prod-2 |
| **Advanced pricing** (compare-at / MSRP / margin display / wholesale price) | Cost price exists per variant (margin is derivable in the UI); compare-at / MSRP / wholesale need columns. | product/variant columns | M | Prod-2 |
| **Advanced inventory** (safety stock / reorder level / track-inventory toggle / preorder) | `allow_backorder` is editable; the rest need columns + reorder alerts. | product/variant columns, alerting | M | Prod-2 |
| **Bulk product actions** (status / featured / collection / price / inventory / tags / archive / export / import) | The list filters + selects exist; safe bulk (with confirm + audit + partial-failure isolation) + CSV import/export is its own slice. | bulk framework, CSV parser | L | Prod-2 |
| **Publishing workflow** (duplicate / unpublish / schedule archive / preview-as-draft) | Scheduled *publish* + status ship now; duplicate, schedule-archive, and a draft preview URL are follow-ons. | preview tokens, scheduler | M | Prod-2 |
| **Product audit history view** | Every change is already audited (product.updated / notes_set / image_* / variant.*); this is a per-product timeline view of that stream (reuse the shared Timeline). | audit stream (exists) | S | Prod-1 |
| **Gallery drag-sort + video + 360 + zoom + mobile crop** | The gallery does add/hero/alt/reorder(↑↓)/delete by URL. Native drag-sort, a video/360 field, zoom, and mobile-crop presets are richer media work. | media columns, upload UX | M | Prod-2 |
| **Image upload (vs paste URL)** | Images are added by Cloudinary URL today; a direct upload would reuse the media provider (as returns evidence does). | media upload wiring | S | Prod-1 |
| **Hero overlay / background controls + signature-section fields** | The hero image is `is_hero` on an image; overlay/background/signature-eyebrow are extra presentation columns. | product columns | S | Prod-2 |

**Explicitly NOT for launch (review) — deliberate:** AI description / AI SEO / AI images, marketplace
feeds (Amazon/Flipkart), barcode scanning, POS, and ERP. These belong to a much later phase.

**Note:** most launch-build fields are *existing* product columns the editor simply didn't expose
(the service comment literally said "the full editorial form layers on later"). The only new columns
(20260730120000_product_cms) are the merchandising flags, visibility controls, chapter position, and
SEO OG/canonical — everything else already fed the storefront and is now editable.

## P9.1 — Products/Chapters CMS (round 2 — Chapter CMS shipped; remaining 35-point items)

**Shipped this round:** a full **Chapter / Collection CMS** at `/admin/collections` (list + create +
editor: name/slug/volume, tagline, poetic line, intro, description, long story, hero desktop+mobile,
hero/signature product, SEO + OG + Google preview, visibility/coming-soon, and product ordering
within the chapter) — launching "Monsoon Library" is now an admin task, not a code change. Also:
**product type** (candle / room freshener / linen freshener / wax tablet / diffuser) + **category**
picker on the product editor; **per-variant barcode, shipping weight, low-stock threshold, and a
Size/Volume field** that holds 100g *or* 100ml; **Duplicate product**; and list polish (stock colour
dots 🟢🟡🔴, "N sold · ₹revenue", thumbnail fallback).

| Feature | Why deferred | Dependencies | Complexity | Phase |
|---|---|---|---|---|
| **Air/spray products in the DB (product-type-driven PDP)** | Room + linen fresheners currently live in `config/theHours.ts` (no DB rows) and the PDP picks candle vs air by slug/config, not a `product_type`. To manage them in the CMS, migrate the config data to real products + variants and make the PDP builder select the experience from `product_type`. The column now exists; this is the migration + PDP-builder change. | product_type (added), PDP builder, data migration | L | Catalog-1 |
| **Volume (ml) on the PDP** | The size/volume is now editable per variant (100ml); showing it prominently on the air PDP (and "50ml/100ml" selectors) is a storefront change. | air PDP components | S | Catalog-1 |
| **Per-product Artist Story** (review 11/33C) | PDP artist block is global config; per-product needs columns + PDP rewire. | product columns, PDP builder | M | Prod-1 |
| **Product Relationships / manual "Continue the Chapter"** (review 10/14/33B/33G) | related_products table exists but empty; related is derived. Manual related/upsell/cross-sell/bundle picker needs it wired + editor. | related_products, editor | M | Prod-1 |
| **Homepage merchandising placement** (review 15/21/33F) | Homepage hero/featured/collection/slider flags need columns + homepage builder wiring. | product columns, homepage builder | M | Prod-1 |
| **Media Library integration** (review 8/33H) | Gallery is add-by-URL + hero/alt/reorder(↑↓)/delete. Direct upload, folders, native drag-sort, crop, mobile-crop, video/360 reuse the media provider + new UX. | media provider, upload UX | L | Prod-2 |
| **Featured review picker** (review 12/33D) | PDP pulls testimonials from config by chapter; a per-product featured-review selector needs the reviews domain populated + a picker. | reviews at volume | M | Prod-2 |
| **FAQ / accordion builder** (review 13/33E) | Care/Shipping/etc. accordion is house copy today; a per-product Q&A builder needs a store + editor. | product_faqs table | M | Prod-2 |
| **Product analytics card** (review 16/31/33I) | Views/orders/conversion/revenue/returns on the editor. Orders/revenue are derivable; views need storefront view tracking. | view tracking, aggregation | M | Prod-2 |
| **Product timeline / version history** (review 17/32) | Every change is already audited (product.* / collection.*); a per-product timeline view + "updated by" reuses the shared Timeline. | audit stream (exists) | S | Prod-1 |
| **Draft preview + Quick view** (review 18/25/26) | Preview-as-draft URL + a hover quick-view popup (story/collection/images/inventory) without opening the editor. | preview tokens | M | Prod-2 |
| **Bulk product actions** (review 23/10) | Checkboxes → make featured/bestseller/archive/assign chapter/change status/duplicate/export/import. The list filters exist; safe bulk + CSV is its own slice. | bulk framework, CSV | L | Prod-2 |
| **Slug-change 301 redirects** (review 1) | Auto-create a redirect when a slug changes (the SEO & Redirects module exists). | redirect service | S | Prod-2 |
| **Repeatable lifestyle rows + story heading/image per section + multiple quotes** (review 5) | Lifestyle is a textarea; the frontend renders labelled rows. Structured repeatable rows + per-section heading/image/alignment + multi-quote need JSON columns or child tables. | schema, PDP builder | M | Prod-2 |
| **Fragrance-note drag-sort + descriptions + strength** (review 6) | Notes reorder is add-order today; native drag, per-note description, and Light/Medium/Strong need columns + DnD. | fragrance_notes columns, DnD | S | Prod-2 |
| **Structured ingredients (wax %/soy %/coconut %/fragrance %/origin/vegan/cruelty-free)** (review 7) | Wax + wick editable; the transparent breakdown needs columns. | product columns | S | Prod-2 |
| **Categories CMS** (review 22/34) | Only "Candles" exists; managing categories (Room Spray, Linen Spray, Wax Tablet) as a module complements product_type. | category admin | S | Catalog-1 |
| **Custom merchandising badges** (review 3) | Beyond the fixed flags — a custom badge (label + colour + date, e.g. "Winter 2026"). | product_badges table | S | Prod-3 |
| **Search-keyword management + internal admin notes + rating** (review 1) | Keywords, admin-only product notes, an internal quality rating. | product columns | S | Prod-3 |
| **Advanced visibility (hidden-but-purchasable / private URL / password / notify-me)** (review 4) | Beyond the 5 visibility toggles + status. | product columns, access control | M | Prod-3 |
| **Per-variant tax override + default variant + inventory history** (review 9) | Tax override + a default-variant flag + a stock-movement log. | variant columns, inventory ledger | M | Prod-2 |

**Architectural note (review 22/34):** the admin nav already groups **Catalog** (Products, Collections,
Coupons, Content, Media, …) — Collections is now a first-class module there, matching the reviewer's
"Chapters are first-class content" recommendation. The Volume → Chapter → Products hierarchy is fully
manageable; the remaining hierarchy work is migrating the config-driven air products into it.

## P9.2 — Products CMS (Batch A shipped — timeline, relationships, placement, SEO preview)

**Shipped this round (all additive, non-breaking; verified with vitest + a Playwright E2E, 22/22):**

- **Product Timeline & activity** (was P9.1 "Product timeline / version history", review 17/32;
  P9 "Product audit history view") — a read-only panel in the product editor showing created / last
  updated / publish state / **last modified by** (resolved from the audit stream) / **last purchased**
  + lifetime units & orders (from paid order lines) + a **recent-activity list** of the product's audit
  events with staff names. Pure surfacing of data already kept — no new columns.
  (`getProductTimeline` in `productAdminService.ts`, action `timeline`.)
- **Related products / manual merchandising** (was P9.1 review 10/14/33B/33G) — a curated relationships
  editor writing to the existing `related_products` table (add/reorder/remove, five types: related /
  upsell / cross-sell / pairs-with / frequently-bought). Critically, the **read path is now wired**:
  `getRelatedProducts` layers curated overrides *ahead of* the same-fragrance/collection algorithm and
  fills the rest — with **zero override rows the result is byte-for-byte the old behaviour** (pinned by
  `src/services/getRelatedProducts.test.ts`, 5 cases).
- **Storefront & homepage placement panel** — groups the merchandising flags (hero / featured /
  best-seller / new-arrival) with honest "where this shows" copy + a link to the Homepage builder.
- **Search & social preview** — live Google SERP + Facebook/OG + X/Twitter cards computed from the SEO
  fields (falls back to name / tagline / primary image), with length-tone hints.

**Deliberately carved out of Batch A (the "skips" — document-and-defer, not silently dropped):**

| Carve-out | Why skipped now | What real completion needs | Complexity | Phase |
|---|---|---|---|---|
| **Genuine per-product homepage *slot* placement** (hero / carousel / featured grid / editor's pick / season / footer) | The editorial homepage is **section/config-driven** (`ComposedSections` → `@/config/*`); it does **not** query products by flag. A product→slot control would render nothing live — a mirage — so it was **not** built. The panel instead surfaces the flags that *do* drive Shop/Chapter badges + ordering, truthfully. | Either make the homepage product-bearing sections query by flag, or add a `homepage_placements` (product × slot × order) table the sections read + a builder UI. Touches the storefront render path — out of Batch A's "don't touch existing" scope. | M–L | Prod-1 |
| **`visible_homepage` / `visible_search` / `visible_website` / `visible_chapter` enforcement** | These columns are stored + editable but have **no storefront consumer** today (verified by grep). Batch A labels `visible_homepage` "reserved" rather than implying it filters anything. | Wire each flag into the relevant query (`getProducts`, shop/chapter builders, homepage) with tests proving a hidden product disappears from exactly that surface. | S–M | Prod-1 |
| **Curated related products showing on the *live* PDP without a rebuild** | PDPs are **SSG** (`● /shop/[slug]`, prerendered). A `related_products` change made in the admin appears only after a rebuild/revalidate — so the E2E asserts the read-path via unit tests, not the static page. | On `relationships.set`, `revalidatePath('/shop/[slug]')` (or tag-based revalidation) so a curated change is live within seconds. Small, but wants the revalidation-on-save pattern applied consistently. | S | Prod-1 |
| **Air/spray PDP honouring manual related overrides** | The override read-path is wired into `getRelatedProducts` (candle PDP). Air PDPs use `getAirSiblings` (chapter siblings) and don't consult `related_products` yet. | Layer the same override read into the air sibling resolver, or unify both PDPs on one related-resolver. | S | Prod-1 |
| **Type-specific merchandising rails (separate *upsell* vs *cross-sell* vs *pairs-with* placements)** | The editor stores all five relation types, but the storefront currently feeds them all into the single "You may also like" rail (type is stored, not yet placement-differentiated). | Give each rail its own query by `relation_type` + PDP slots ("Pairs well with", "Complete the ritual"). | M | Prod-2 |

**Note:** everything shipped in Batch A reuses existing tables (`related_products`, `audit_events`,
`order_items`, `products`) and the resilient-save pattern — **no migration required**.

## P9.3 — Category CMS + product bulk operations (Batch B)

**Shipped this round (additive, non-breaking; vitest + Playwright E2E, 19/19):**

- **Category CMS** (was P9.1 "Categories CMS", review 22/34) — a full `/admin/categories` module
  (list + create + edit + reorder ↑↓ + activate/deactivate + **guarded delete**) managing the catalog
  taxonomy that seeds SKU prefix / HSN / GST defaults. Deletion is **blocked while any product
  references the category** (the FK is `on delete restrict`) with a clear "reassign first" message, so
  a live product can never be orphaned. New nav entry under **Catalog → Categories**.
  (`categoryAdminService.ts`, `/api/admin/categories`, `CategoryManager.tsx`.)
- **Product bulk operations** (was P9.1 "Bulk product actions", review 23/10) — multi-select in the
  product list (per-row + select-all-on-page + "select all N filtered") with a bulk action bar: set
  status, feature/unfeature, mark best-seller / new, **assign to (or remove from) a chapter**, and
  **CSV export** of the selection. Each action is **one `update … in (ids)` query (no N+1) + one audit
  event**; ids are de-duped and capped at 500. (`bulkUpdateProducts` in `productAdminService.ts`,
  action `bulk`; pinned by `src/services/bulkUpdateProducts.test.ts`, 7 cases.)

**Deliberately carved out of Batch B (the "skips"):**

| Carve-out | Why skipped now | What real completion needs | Complexity | Phase |
|---|---|---|---|---|
| **Nested category hierarchy** (parent → child, e.g. Candles › Votive) | The `categories` table is **flat — no `parent_id`**. The user's point-10 "hierarchy" implies nesting; the CMS ships the flat taxonomy that actually exists rather than faking a tree. | Add a nullable `parent_id` FK (self-reference) + a tree UI + storefront breadcrumb wiring. Migration + render change. | M | Catalog-1 |
| **Bulk CSV *import*** (create/update products from a spreadsheet) | Export ships (client-side, no server); import is a much larger slice — parsing, per-row validation, dry-run preview, partial-failure isolation, and idempotency — and can create/overwrite money-bearing catalogue rows. | A CSV parser + a staged import (validate → preview → commit) with per-row error reporting + audit. | L | Prod-2 |
| **Bulk delete / bulk archive as a one-click** | Excluded as a **destructive default**. Status can be set to `archived` in bulk explicitly, but there is no silent bulk wipe. | If wanted: a guarded destructive bulk (typed confirmation + reason + per-record audit + undo), mirroring the orders bulk-cancel guardrails. | M | Prod-2 |
| **Bulk edit of price / stock / tags** | Batch B covers status / featured / flags / chapter / export — the safe, common merchandising moves. Price & stock are money/inventory-sensitive and deserve their own validated flow. | A bulk price/stock editor with min/max guards + per-variant awareness + audit. | M | Prod-2 |

**Note:** Batch B reuses the existing `categories` + `products` tables and the audit stream — **no
migration required**. Categories remain admin-only taxonomy (SKU/HSN/GST defaults); they are not a
storefront browse dimension today (the storefront browses by Collection/Chapter), so no storefront
change was needed or made.

## P9.4 — Variant logistics fields + product-type specifications (Batch C)

**Shipped this round (additive; vitest + Playwright E2E, 13/13):**

- **Extra variant fields** (was P9.1 review 9) — per-variant **shipping class**, **package L/W/H (cm)**,
  and **supplier SKU**, plus two **derived, read-only** helpers in the editor: **margin** (price − cost,
  from the existing `cost_price`/COGS) and **volumetric weight** (L×W×H ÷ 5000). Migration
  `20260805120000_variant_logistics_fields.sql` — **resilient**: a variant save strips these columns
  and retries if the migration isn't applied yet, so nothing hard-fails pre-`db push`.
  (Also fixed a latent NOT-NULL edge: `upsertVariant` no longer sends a bare `null` for
  `low_stock_threshold`, so creating a variant without touching that field takes the DB default.)
- **Product-type specifications** (was P9.1 "Product Type → different editor", review point 9) — wax
  tablet / reed diffuser / other now get a **type-appropriate specs panel** in the editor (label/value
  rows, seeded with per-type defaults — longevity / placement / how-to for tablets; reeds / flip /
  coverage / refill for diffusers) that renders as a real **"Specifications" grid on the PDP** (reuses
  the existing PlacementGrid block, lands after Craft). Stored in `pdp_content.specs` — **no migration**.
  Pinned by `src/lib/candleSpecs.test.ts` (4) + `src/services/variantLogistics.test.ts` (3).

**Deliberately carved out of Batch C (the "skips"):**

| Carve-out | Why skipped now | What real completion needs | Complexity | Phase |
|---|---|---|---|---|
| **Per-variant tax class** | GST is **product-level** (`products.gst_rate` / the category default). A variant-level tax override would be **inert** — nothing in checkout reads it — so it wasn't added as a fake field. | A variant `tax_class` column **plus** checkout/GST wiring that prefers it over the product rate, with invoice + reporting coverage. | M | Prod-2 |
| **Inventory history / stock-movement ledger** | **No such table exists**; stock is a single scalar `variants.stock`. A real history needs a ledger written on *every* stock change (checkout decrement, fulfillment, manual edits, returns restock). | A `stock_movements` (variant × delta × reason × actor × ts) table + writes at each mutation point + a per-variant history view. Touches checkout/fulfillment. | L | Prod-2 |
| **Per-variant warehouse link** | **No warehouse-location model** (already documented in P5 — stock is one scalar, no bin/rack/warehouse rows). | The Warehouse Location dependency in P5 (a `variant_locations` table) must land first. | M | WhOps-1 |
| **Volumetric shipping wiring** | Package dims are stored + shown (with a derived volumetric estimate), but the shipment request builds parcels from the **Packaging Engine**, not per-variant dims — so dims aren't auto-fed into courier rating yet. | Make `packOrder` / `buildShipmentRequest` prefer per-variant dims when present (fall back to the packaging catalogue). Additive but touches the shipment path. | M | Ship-2 |
| **Auto-neutralising candle framing for non-candle types** | wax tablet / diffuser still render through the candle PDP, which keeps candle-specific bits (burn-time hero stat, wax/wick craft tiles, care accordion). The admin can override those via the existing candle CMS, and the new specs grid adds the correct details — but the candle framing isn't auto-hidden by type. | Make `buildCandleEditorial` type-aware (hide/relabel burn-time + craft + accordion by `product_type`), or a dedicated tablet/diffuser PDP template. | M | Prod-2 |

**⚠ Migration to apply:** `supabase/migrations/20260805120000_variant_logistics_fields.sql` — run
`npx supabase db push`. Until then the logistics fields are editable but not persisted (the resilient
strip keeps saves working); the specs feature needs no migration.

## P10 — Homepage CMS (every section editable + preview)

**Context:** the homepage already had a full Page Builder (composer engine + schema-driven forms +
draft/publish/schedule/revisions/autosave/edit-lock + a device-switching draft preview), and 6 of 9
sections were DB-editable. This round finished the job.

**Shipped this round (additive; vitest + Playwright E2E, 17/17; no migration):**

- **The 3 remaining `sourced` sections are now fully editable blocks:**
  - **Signature Chapters** — editable eyebrow / heading / sub-line + a card per Volume (volume label,
    title, poetic line, **gradient "volume colour"**, chapter link). "Select the volume colour" ✔.
  - **Featured Atmosphere** — a **repeatable block per fragrance**, each with **its own image** +
    name / type / chapter / scene / memory / atmosphere words / signature line / fragrance journey /
    CTA / tone. First shows; the rest become the selector. "Which one to select · 3 different images ·
    tomorrow different" ✔ (add/edit/remove blocks).
  - **Editorial World** — a block per photo-grid plate with **its own image, editable hover name
    (title), alt, role-in-spread and link**. "Photo-grid hover name editable" ✔.
- **Brand Story** gained image + image-alt + orientation + pull-quote + CTA fields (matches the design).
- **SchemaForm upgrades (benefit every builder — homepage/about/journal/email):** a real image
  **Upload** button + thumbnail on `media` fields ("each image upload should exist" ✔), a **colour
  picker**, and a **gradient-preset picker** (the 22 `grad-*` tokens). "Select gradient/volume colour" ✔.
- Un-edited homepage renders **byte-for-byte as before** — each list section falls back to its config
  catalogue when no items are saved (pinned by `src/lib/homepageSections.test.ts`).

**Deliberately carved out (the "skips"):**

| Carve-out | Why now | What full completion needs | Complexity | Phase |
|---|---|---|---|---|
| ~~Live-as-you-type preview~~ | **SHIPPED** — the homepage builder now has a **side-by-side live preview** (`LivePreviewPanel` → `/homepage-preview` renders `ComposedSections` from the postMessage'd draft), updating as you type without saving, with Desktop/Tablet/Mobile widths. Same family as the PDP/chapter editors. | — | done | — |
| **Chapters auto-synced from `/admin/collections`** | The homepage chapter cards are **independent content** (so you can set each Volume's colour + poetic line here). They don't auto-mirror the real collections. | A "sync from collections" toggle that populates cards from live chapters, with per-card overrides. | S–M | HP-2 |
| ~~Featured-Atmosphere product picker~~ | **SHIPPED** — each Featured-Atmosphere block now has a **"Pull from a product"** picker: choosing a real product fills the block's fields (name / image / chapter / type / link) from it, and every field stays editable — or leave it blank and type your own. Generalised via `FieldDef.blockSource` + `EntityOption.data`, so any block can offer a "pull from" source. | — | done | — |
| **Free-form photo-grid geometry** | Plates are placed by `editorialImportance` (Opening = large left · Closing = right · others centre) — the art-directed layout is fixed by the design system; admins choose each plate's role, not pixel geometry. | A layout-variant selector if free composition is ever wanted (design decision, not just code). | M | HP-3 |

**Note:** all of this reuses the existing `composed_pages` engine + section registry — **no migration**,
and the same builder now makes About and Journal richer for free (shared SchemaForm + section defs).

## P10.1 — Homepage Builder editing + section management (Phases 1–2)

**Shipped — Phase 1 (editing experience; Playwright 12/12):** bidirectional **editor ↔ preview
navigation** (click a section either side → the other scrolls + flashes), **per-section save status**
(✓ Saved / ● Unsaved / Saving…), a **dirty-state warning** (beforeunload + in-app nav guard, only when
unsaved), **accordion + Expand/Collapse All**, and **scroll/position memory** (sessionStorage).

**Shipped — Phase 2 (section management; Playwright 18/18 + a drag test):** **duplicate section**
(deep-copies all settings), a **visibility status** dropdown — Visible / Hidden / **Scheduled** (per-
section window, evaluated at request time on the force-dynamic homepage) / **Archived** — with a
guarded Remove; **section templates** (a pre-filled "Add section" picker); a **reusable section
library** ("Holiday Hero", "Launch Banner"…) stored in the generic `settings` table (no migration) and
insertable into any composed page; and **drag-and-drop reordering** (framer-motion `Reorder` + a drag
handle, ↑/↓ kept for keyboard). Section state lives in reserved `settings.__state/__from/__until` keys,
so the composer contract and storefront rendering are untouched (a legacy section with no `__state`
renders exactly as before).

**Deliberately deferred (the "coming soon" templates need NEW storefront components — shown disabled in
the picker, never faked):**

| Template | Why deferred | What it needs | Complexity |
|---|---|---|---|
| **Split Hero** | The `Hero` component is single-column | A two-column hero component (image + copy) + schema + registry entry | S–M |
| **Video** | No video section exists | A `Video` section (background/embedded, poster, mute/loop) + schema + storefront component | M |
| **Instagram** | No social integration | An Instagram feed section + a Graph-API/feed integration + caching | M–L |
| **Journal** | No homepage journal block | A `JournalTeaser` section pulling latest entries from the journal service + component | S–M |

Each is a *self-contained* addition to the section registry (schema + component + `ComposedSections`
mapper), which is exactly the extensibility the Homepage Builder is designed for — no builder rewrite.

## P10.2 — Homepage Builder publishing workflow (Phase 3)

**Shipped (Playwright 15/15 + 9 unit tests; no migration):**

- **Section validation (11)** — each section's schema errors surface **inline** (a "⚠ N" badge + the
  list when open) and in a publish-bar summary; publishing an incomplete section is blocked (the
  server validation now also runs per-section on selective publish). *I deliberately did not add new
  required fields* — surfacing the existing schema requirements only, so the current homepage still
  publishes.
- **Publishing states (12)** — a derived **Published / Draft / Hidden / Scheduled / Expired / Archived**
  badge per section, from `__state` + the schedule window + whether the section's content matches what's
  live (server `publishStatusById`) and has no pending edits.
- **Publish selected sections (13)** — tick sections → **Publish selected**. `publishPageSections`
  merges the chosen sections' draft content into the live `published` array while keeping unselected
  sections' live content (pure `mergePublishedSections`, unit-tested). Whole-page Publish is unchanged.
- **Per-section schedule (14)** — the Phase-2 window is relabelled **Publish on / Unpublish on** and now
  reads **Expired** past its end; the storefront gate (`sectionScheduleOk`) is request-time accurate.
- **Version history (15)** — each revision now has **Preview** (streams that version into the live
  preview with an exit banner) and **Compare** (a diff: which sections a restore would add / remove /
  change) alongside the existing **Restore**.

All additive: the storefront still reads `published` exactly as before; selective publish only updates
`published` per section; section state lives in reserved `settings.__*` keys — no schema or DB change.

## P10.3 — Homepage Builder content editing (Phase 4)

**Shipped (Playwright 16/16 + 11 unit tests; no migration):**

- **Rich text editor (16)** — `richtext` fields now render a no-dependency WYSIWYG editor
  (`RichTextField`): a contentEditable area + toolbar for **Bold / Italic / H2 / H3 / Quote /
  Paragraph / bullet + numbered lists / Link / inline image upload**. Output is constrained HTML,
  sanitised on every change by an **isomorphic allowlist sanitizer** (`src/lib/cms/richText.ts`):
  only `a,b,strong,i,em,u,ul,ol,li,blockquote,h2,h3,h4,p,br,img` survive; `<script>/<style>/<iframe>`
  and their content are dropped, event-handler attrs and `javascript:/data:/vbscript:` URLs stripped,
  disallowed tags unwrapped keeping their text. Rendered on the storefront via `<RichText>` (server
  component, sanitised again before `dangerouslySetInnerHTML`). Threat model: content is authored only
  by staff with `catalog.manage`. *Fixed a controlled-contentEditable defect along the way* — the
  editor no longer reassigns `innerHTML` on its own sanitised echoes (tracked via a `lastEmitted`
  ref), which previously collapsed the caret and dropped characters during rapid typing.
- **Reorder + repeatable heterogeneous blocks (17, 18)** — a new **`blockVariants`** field DSL lets one
  `blocks` field hold mixed block types, each with its own fields and its own **"+ Add <Quote /
  Paragraph / Heading / Image / Button>"** button; blocks reorder with ↑ ↓ and delete with ×.
  `validateContent` validates each block against its own variant's fields (keyed by `block._type`).
- **New "Editorial content" section (`content-blocks`)** — the first section built on `blockVariants`:
  compose Heading / Paragraph (rich text) / Quote / Image / Button blocks in any order. Registered in
  the section registry + offered as an **"Editorial content" starter template** (seeded with a
  heading + rich-text paragraph + quote) and as a blank type. Storefront component `ContentBlocks`.
- **Homepage search (19)** — a **Find section / content** box in the builder toolbar dims non-matching
  rows and highlights matches (with a live match count); matches on section label/type **and** on the
  section's content (its serialised settings), so large pages are navigable.

All additive: `richtext` was a pre-existing unused field type; `blockVariants` is optional and
backward-compatible; `content-blocks` is a brand-new section type — existing sections, the storefront,
and the DB schema are untouched, no migration.

## P10.4 — Media Management (Phase 5)

Analysis first established that most of the plumbing already existed (a `media` table with
folders/tags/focal/blur, `mediaService`, the `/admin/media` library, Cloudinary signed uploads, the
`seo_overrides` SEO engine + `withRouteSeo`), so this phase was **targeted wiring**, not greenfield.

**Shipped (unit + Playwright tested; one small additive migration):**

- **Hero treatment controls (24)** — the Hero gained optional **background video, content alignment,
  overlay style (scrim/dark/gradient/none) + strength, button style, entrance-animation toggle, and
  scroll-indicator toggle**. All optional → existing heroes render identically.
- **Homepage SEO (24)** — a **"Page SEO & social preview"** panel inside the builder (works for
  homepage/about/journal via each page's live path) edits the DB SEO override (title/description/OG
  image/canonical/robots) with a live **Google SERP + OG card** preview, saving via `/api/admin/seo`.
- **Alt-text validation (22)** — a media field's alt (via the new `altFor` link) **warns when a real
  image has no alt** and offers a **"Decorative" toggle** (sidecar `<img>__decorative`) to suppress it.
- **Media Library picker (20/25)** — a **"Browse Media"** modal on every media field: browse grid,
  search, folder + tag filters, **recently used**, reuse, upload/replace, and a new GET
  `/api/admin/media` list endpoint (items + folders + tags). Inline **Alt / Credit / Copyright** editing
  persists to the asset (new `media.credit`/`copyright` columns — migration `20260806120000`, service
  degrades gracefully pre-migration).
- **Image editing — crop + focal (21)** — the picker has a click-to-set **focal point** and
  **aspect-ratio** presets; the selection is baked into a Cloudinary delivery URL
  (`cldCrop` → `c_fill,g_<focal>,ar_<ratio>,f_auto,q_auto`), so any plain `<img>`/background shows the
  cropped, focal-aware image with **no per-component change**. Focal also saved to the asset.
- **Video support (23)** — the media upload route + Cloudinary provider now accept **MP4/WebM** (video
  `kind`, no image-only transforms); a `parseVideo` helper + `<VideoEmbed>` render **MP4 / YouTube /
  Vimeo** (YouTube via privacy `youtube-nocookie`, lazy 16:9 iframe); a new **video block** in the
  Editorial-content section; and hero **background video**.
- **Editorial blocks (26)** — Bold / Italic / Links / Lists / Quotes were already delivered by the
  Phase 4 rich-text editor (`RichTextField` + sanitiser); verified, no new work.

Additive throughout: the one migration only **adds** two nullable `media` columns; every storefront
change is opt-in (absent settings → the original look).

## P10.5 — Homepage Analytics (Phase 6)

Built on the existing consent layer (`consentGranted()` / `samorah_consent`) and the GA4 stack, but
**first-party** so the numbers exist without waiting on the GA4 Data API. Unit + Playwright tested.

**Section analytics (26)** — a builder panel showing **Views / CTR / Scroll % / Clicks / Conversions**
per homepage section over the last 30 days:
- A new `section_events` table (RLS policy-less; `service_role` only) + a stable `section_analytics(page_key, days)`
  SQL rollup (migrations `20260807120000` + grants `…130000`/`…140000`, all applied).
- Storefront tracking: `ComposedSections` renders each live section in a `display:contents` wrapper
  (`data-sa-id` — **zero layout change**); `<SectionTracker>` observes them and records a de-duped
  **view** (≥50% visible), max **scroll** depth, and **clicks**, batched via `sendBeacon` to the public
  `POST /api/analytics/section` ingest (rate-limited, errors swallowed). **All consent-gated**, only an
  ephemeral per-tab session id — no PII.
- **Conversions** = last-touch attribution: a section CTA click stamps `sa_last_section`, which
  `useCartStore.addItem` reads on add-to-cart to credit that section.
- `getSectionAnalytics` aggregates + derives CTR; the panel lines the metrics up with the section list.

**Performance meter (27)** — a builder panel estimating **homepage image weight, largest image,
heaviest section, and estimated load time** (~4 Mbps mobile). Deterministic: `getHomepagePerformance`
walks the draft's image URLs, sizes them against the `media` table (matching a cropped delivery URL back
to its raw base), and flags external/unknown-size images. No tracking, computed server-side per load.

Real-world scenario the panels answer: *"Featured Atmosphere gets 1,240 views but 2% CTR and only 30%
scroll — visitors aren't reaching it; move it up. The Hero image is 2.1 MB — re-upload a lighter master
to cut ~1s off load."* Additive: storefront DOM is byte-for-byte unchanged; three additive migrations.

## P10.6 — Samorah-specific homepage features (Phase 7)

- **Featured content pickers (28)** — a new **"Featured spotlight"** section: feature any **Product /
  Chapter / Atmosphere / Testimonial / Artist / Journal piece** from a dropdown instead of hardcoding.
  The `reference` field gained **`refFill`** — picking an item denormalises its display data
  (title/image/alt/href/blurb) into the section's editable fields, so the storefront needs no async
  resolver. Every featurable entity is loaded normalised to one shape (products + collections from DB;
  atmosphere/testimonials/artists from config; a new `journalHighlights` config until a Journal CMS lands).
- **Seasonal homepage (29) + presets (30)** — save the whole composition as a named/seasonal **preset**
  (Default / Autumn / Summer / Christmas / Diwali / Launch), then **Apply** it into the draft (clone) or
  **Activate** it (publish live) with one click — the seasonal switch. Stored in the generic `settings`
  KV row `page_presets` (no migration, mirroring the Section Library); two new API actions
  (`preset.save`/`preset.delete`), with Apply client-side and Activate reusing the publish action.
- **Homepage SEO — structured data (31)** — automatic global **Organization + WebSite** JSON-LD on every
  store page, plus an editable **per-page custom JSON-LD** in the SEO panel (`seo_overrides.structured_data`,
  migration `20260808120000`) rendered on the homepage. (Title/description/OG/canonical/robots shipped in
  Phase 5.)
- **Accessibility checker (32)** — a builder panel auditing the live draft for **missing alt text,
  heading-hierarchy problems, low contrast, broken buttons, and empty links**, computed client-side from
  section state (updates as you edit); click an issue to jump to its section. WCAG contrast math extracted
  to a shared `lib/a11y/contrast` util.

Real-world scenario: *"Save the current homepage as 'Diwali Homepage', swap the Hero + a Featured
spotlight for the festival, and Activate on the day — one click, live. The checker flags the new Hero
image has no alt and the CTA lost its link before it ships."* Additive throughout; one additive migration.

## P10.7 — Professional editor features (Phase 8)

- **Undo / Redo (33)** — a `useHistoryState` hook (bounded past/future stack; consecutive edits to the
  same field coalesce into one step) backs the builder's section state. **Ctrl/Cmd+Z** undo,
  **Ctrl/Cmd+Shift+Z** (or **Ctrl+Y**) redo, plus toolbar ↶/↷ buttons.
- **Keyboard shortcuts** — **Ctrl/Cmd+S** save · undo/redo · **Ctrl/Cmd+/** focus the find box · **Esc**
  closes the top-most modal. One global keydown handler via a stable ref (always sees current state).
- **Multi-user safety (34)** — the existing advisory lock is now enforced: when another editor holds the
  lock the builder shows **"Currently edited by …"** and goes **read-only** (controls
  `pointer-events:none`, autosave suspended); a **"Take over editing"** button steals the lock
  (`acquireLock({steal})`) and flips the other editor to read-only on their next heartbeat.
- **Audit timeline (35)** — every change records **who / what / when / previous → new**. A pure
  `diffSections` util computes field-level diffs; `savePageDraft` logs a `page.edited` audit event with
  the diff (publish/reset/restore are tagged too, keyed by `metadata.pageKey` since `audit_events.entity_id`
  is a uuid). A builder panel lists the timeline with actor names, each edit expandable to its field diffs.
- **Preview modes (36)** — Desktop / Tablet / Mobile already existed; added **Dark** (same-origin style
  injection: invert the page, re-invert media — an approximation until a real dark theme) and **Print**
  (`iframe.print()`).

Real-world scenario: *"Two editors open the homepage at once — the second sees 'edited by Priya' and a
read-only page, takes over when Priya's done, undoes an accidental section delete with Ctrl+Z, checks the
audit timeline to see exactly which fields Priya changed, previews it in Dark, and Ctrl+S to save."*
No migration — built on the existing locks/audit tables.

## P10.8 — Homepage Builder: deferred / partial sub-points (Phases 4–8)

Every phase point is implemented and E2E-tested. Two items remain intentionally deferred (large new
surfaces; the second was spec-marked "future"), plus one micro-enhancement — recorded so nothing is lost:

- **Per-breakpoint focal — Phase 5 · #21 ("Mobile Crop / Desktop Crop") — CLOSED.** The media picker now
  has **Desktop / Mobile focal tabs**; each stores its own focal (`<key>__focal` / `<key>__focalMobile`)
  and the hero background reframes per breakpoint via CSS custom properties + a `max-width:768px` media
  query (backward-compatible — no mobile focal → falls back to the desktop focal → centre). Crop / Focal
  Point / Aspect Ratio (desktop) were already done. The micro-enhancement — a different **aspect ratio**
  per device (art-directed `<picture>`/`srcSet` + a separate mobile crop URL) — is now also **CLOSED**:
  the picker bakes a mobile Cloudinary crop (`<key>__mobile`) and Hero / ContentBlocks / FeaturedContent
  render `<picture>` (or a mobile background div for the hero). Fully backward-compatible.
- **True dark homepage theme — Phase 8 · #36** (the spec marked Dark + Print "future"). The **Dark**
  preview is a CSS invert/hue-rotate **approximation** (media re-inverted) — a preview aid, not a
  shippable dark storefront, because the homepage sections have no dark `data-theme` tokens. **Print** is
  basic (`iframe.print()`), no dedicated print stylesheet. Needs: authored dark tokens per section.
- **Featured Journal entity — Phase 7 · #28.** The Journal is a composed page, not a post collection, so
  "Featured Journal" is backed by an editable `journalHighlights` config rather than a DB posts table. A
  real Journal CMS (post entity + admin) would replace it; the picker already resolves it identically.

Everything else across points **16–36** (rich text, reorder/repeatable blocks, search, media library +
tags + folders + recently-used + replace + credits/copyright, alt validation, video MP4/YouTube/Vimeo +
hero bg video, hero treatment controls, homepage SEO + structured data, section analytics, performance
meter, featured pickers, seasonal presets, accessibility checker, undo/redo, keyboard shortcuts,
multi-user read-only + take-over, audit timeline, Desktop/Tablet/Mobile preview) is **fully implemented**.

### Deferred hardening items (from the Homepage Builder security sweep)

The high/medium-risk findings were fixed inline (sanitizer entity/control-char decoding, analytics ingest
64 KB body cap, `safeHref` protocol allowlist on all CMS-authored CTA links, `listMedia` search
metacharacter escaping). These lower-risk items are deferred — none is exploitable by the current trusted
`catalog.manage` operator set; they matter only under multi-writer or hostile-operator threat models:

- **Section-analytics metric poisoning (MEDIUM).** The ingest endpoint is public (storefront posts events)
  and rate-limited, but a scripted client could still inflate a section's view/click counts within the
  rate limit. Acceptable for first-party dashboards today; revisit if analytics ever drive automated
  decisions. Mitigation options: per-session dedupe server-side, or an HMAC-signed event envelope.
- **Settings-KV lost-update race (LOW).** `pagePresetsService` (and the generic `settings` KV row) does a
  read-modify-write with no optimistic concurrency, so two admins saving presets simultaneously can clobber
  each other's change. Rare with one operator. Fix: a version column + conditional update, or JSONB merge.
- **`cms_locks` acquire race (LOW).** Lock acquisition isn't a single atomic upsert-with-condition, so a
  precise-timing double-acquire is theoretically possible. The 90 s lease + heartbeat + take-over UI make
  the practical impact negligible. Fix: move the freshness check into a conditional SQL upsert.
- **Revision restore not resource-scoped + skips validation (LOW).** `revisions.restore` trusts the stored
  snapshot and doesn't re-validate against the current schema or assert the target resource. Low risk (only
  staff-authored snapshots), but a schema drift could restore a now-invalid shape. Fix: re-run
  `validateContent` on restore and assert `resource` matches.
- **`cmsLockService` `Date.parse` NaN guard (LOW).** A malformed timestamp yields `NaN`, which compares
  falsey and is treated as stale. Harmless (fails safe toward "expired") but worth an explicit guard.

## P11 — Coupon & Promotions: deferred (Phase 3 / post-launch)

Phases 1 (core rules) and 2 (admin & campaign management) are complete. The following were **intentionally
deferred** during Phase 2 (locked decision: "do not add customer segmentation, VIP rules, campaign
analytics or other Phase-3 functionality") and documented here so nothing is lost. The architecture was
built to accept them without a rewrite:

- **Customer segmentation eligibility.** Today `coupons.eligibility` is `everyone | first_order`. The
  column is a string enum specifically so `returning | segment | vip | wholesale_excluded` can be added
  later. Enforcement would extend `customerHasPaidOrder`-style checks (repriceCart + reserve_coupon) with
  segment membership; no schema rewrite. Needs a customer-segment definition/source first.
- **Returning-customer & VIP coupons.** As above — a segment predicate resolved at application/repricing
  and re-validated atomically at reservation, reusing the Phase-1 two-level identity pattern.
- **Wholesale exclusions.** Exclude wholesale customers/orders from consumer coupons (or vice-versa) once
  the wholesale customer flag is part of the checkout identity.
- **Campaign analytics.** Redemption/revenue-impact dashboards (redemptions over time, revenue lift, CTR,
  first-order conversion). The data already exists — `coupon_redemptions` (lifecycle ledger) + the
  per-coupon `audit_events` timeline + order snapshots (`coupon_code`, `discount_amount`, per-line
  `line_discount`). This is a reporting layer, not new capture.
- **Free-shipping-only usage caps at the ledger.** DONE in Phase 1's extension (multi-coupon-per-order
  ledger) — free-ship coupons are now tracked. Left here only as a note that it's covered.
- **is_active column cleanup.** `coupons.is_active` is deprecated (derived from `status` via trigger). A
  later migration should drop it once no external reader remains.
- **Checkout reconfirm UI for repriced coupons.** The server already returns a 409 `{repriced, summary}`
  when a coupon can't be honoured at create-order (never overcharges); the checkout client should render
  that summary for explicit customer reconfirmation rather than a generic error.
- **Coupon preview at cart (pre-checkout).** Auto-apply / targeted discounts are authoritative at checkout
  reprice; surfacing them on the cart page/drawer (via the preview endpoint) is a UX enhancement.

### Phase 3 shipped (list + analytics) — and what it deliberately deferred

**Shipped (2026-08-04):** operational coupon list (Attributed Revenue + Gross Discount columns, search,
filters incl. applies-to + operational-health, sorts), per-coupon analytics + contributing-orders
drill-down (behind `analytics.view`, deep-linking to the Order Command Centre), optional code generator,
and severity-aware operational warnings reusing the canonical promotion engine. Attribution is a
**read-only** model over the Phase-1/2 ledger — Model A (merchandise-only), net-merchandise base
(`subtotal − discount_amount − loyalty_discount`), conservative refund netting, payment-proven
qualifying predicate (`state ∈ consumed|restored ∧ consumed_at ∧ order paid`).

**Deferred — do NOT fabricate these; each needs data/tracking we don't yet have:**
- **Precise merchandise refund allocation.** Today refund netting is deliberately conservative because
  the refund ledger (`refunds.amount` / `orders.refund_amount`) stores a flat order-level total with NO
  merchandise/shipping/tax split. Precise netting needs reconciled `return_items.line_amount` linked 1:1
  to refunds (only return-based refunds carry line detail today). Until then, partial-refund attribution
  uses `max(0, grossBase − refund_amount)`.
- **Guest/account identity reconciliation.** `Unique Customers` counts distinct redeeming identities
  (`coalesce(user_id, guest:email)`); the same person across guest+account or multiple emails counts
  more than once. Needs an identity-resolution/customer-merge layer.
- **Attribution/marketing analytics that require tracking we don't capture:** coupon
  impression→apply→checkout→purchase funnel; conversion rate; GA4 campaign integration; acquisition /
  source attribution; influencer attribution; incremental lift; coupon-acquired customer cohorts / LTV;
  repeat-purchase analysis; profitability / contribution margin after coupon (needs COGS); advanced
  campaign comparison; ROAS / CAC. **These are intentionally NOT implemented** — "Attributed Revenue" is
  an attribution model, never a causation/ROI claim.
- **Operational tooling:** configurable warning thresholds (24h expiry is centralized in
  `couponWarnings.ts` but not yet admin-configurable); analytics exports / scheduled campaign reports;
  anomaly detection. Server-side financial aggregation is already isolated in `couponAnalyticsService`
  so pagination can move server-side without a UI rewrite.

---

# Coupons & Promotions — Post-Launch

**Status — CLOSED (2026-08-04).** Coupon module **Phase 1, Phase 2, Phase 3 and the final UI/UX QA
pass are COMPLETED and closed**; Phase 4 (domain/service test coverage) and Phase 5 (this roadmap) are
done. Shipped: discount types + targeting + exclusions + race-safe redemption ledger (P1);
lifecycle/eligibility/description-split/audit (P2); list & analytics with attribution + warnings +
drill-down (P3); compact/responsive admin UI (final QA). New Coupon defaults are intentionally
unrestricted (min qualifying items = none, per-customer = unlimited). Everything below is
**deliberately deferred** — documented so it is not lost, and **not to be built now**. The guiding rules from the build still hold: **one authoritative pricing
engine** (`computeOrderTotals` → `computePromotions`), **additive/backward-compatible only**, **never
a second discount engine**, and **Attributed Revenue is an attribution model, never a causation / ROI
claim**. Complexity legend as above (**S/M/L/XL**).

> **Scaffolding that already exists** (coordinate with it; do not duplicate): the `phase_2e3_post_launch`
> migration created **`gift_cards`, `loyalty_transactions`, `referral_codes`, `referral_uses`** tables;
> `users.loyalty_points` + `users.loyalty_tier` (bronze/silver/gold/platinum); `orders.loyalty_discount`
> + `orders.gift_card_amount` columns (present, unwired); the **composition/bundle** architecture
> (`compositions`, `compositionId` on lines); `product_type = 'gift_card'`; the **capability** RBAC
> (`capabilities.ts`); the canonical warning engine (`couponWarnings` + `couponEligibleLines` +
> `canCombine`); `couponCodeGen`; and the parked **GA4 Data API (WIF)** integration.

### A. Advanced customer segmentation — **L**
Eligibility beyond `everyone | first_order`: returning · selected customers · VIP · customer tags ·
segments · lifetime spend · order count · dormant · wholesale/B2B include/exclude. **Extend the
`eligibility` enum** (already a string enum for exactly this) and resolve a segment predicate at
application/repricing **and** re-validate atomically in `reserve_coupon` — reusing the Phase-1
two-level identity pattern (`customerHasPaidOrder`-style). *Dependency:* a canonical customer-segment
source/definition (+ `loyalty_tier` for VIP). No pricing-engine change.

### B. Advanced BOGO / quantity promotions — **XL**
Buy X Get Y · Buy 2 Get 1 · Buy 3 save X% · tiered quantity discounts · mix-and-match · cheapest-item-
free · category combinations. Build as a **promotion-rule extension** (new `PromotionKind`s + rule
config feeding the existing allocator), **not** hacks inside basic percent/fixed coupons. Must keep
per-line GST extraction + deterministic allocation intact. *Dependency:* rule schema + engine kinds.

### C. Bundled promotions — **L**
"Candle + Room Spray = 15% off"; "choose any 3 = ₹X". **Coordinate with the composition architecture**
(`compositions` / `compositionId`) — bundle detection already exists and is intrinsically excluded from
ordinary coupons, so this is a dedicated bundle-promotion rule, not a coupon overload.

### D. Loyalty integration — **XL**
Loyalty points · member pricing · reward coupons · birthday/anniversary rewards · tier benefits.
Tables exist (`loyalty_transactions`, `users.loyalty_points/tier`, `orders.loyalty_discount`). **Keep
loyalty accounting a SEPARATE ledger** from coupon accounting — `loyalty_discount` is already its own
order column (never folded into `discount_amount`); analytics must not mix the two. *Dependency:*
loyalty earn/burn engine.

### E. Referral integration — **L**
Referrer reward · referred-customer discount · referral-code lifecycle · fraud protection · attribution.
**Coordinate with `referral_codes` + `referral_uses`** (already created). A referral discount is a
coupon-shaped benefit but keyed to the referral graph; attribution flows into H/I, fraud into T.

### F. Gift card / store credit interactions — **M**
Define combination rules between coupon · gift card · store credit · loyalty reward · refund credit.
**Gift cards / store credit stay financial instruments (tender), NOT coupons** — the engine already
models `giftCard` as tender reducing `payable` (currently unwired), separate from `discount`. The
store-credit refund method exists but is disabled (needs a ledger). Rule of thumb: coupons discount
*merchandise*; instruments *pay*. Never route either through the coupon tables.

### G. Influencer / creator campaigns — **M**
Creator-specific codes · campaign owner · usage · revenue · AOV · new customers · attribution ·
optional commission. **Most metrics already exist** — the Phase-3 analytics service computes Attributed
Revenue / AOV / unique customers / redemptions per coupon. Net-new: a `campaign_owner`/creator link,
new-vs-returning split (needs H), and commission accounting (a payout ledger, only if ever needed).

### H. Campaign attribution — **L**
Integrate GA4 · UTM params · Meta · email · influencer campaigns; attribute coupon → campaign
**without assuming the coupon caused the sale**. *Dependency:* capture UTM/campaign on the session/order
(not tracked today) + the **parked GA4 WIF** pipeline. This is the tracking layer the Phase-3 roadmap
notes call out as the prerequisite for conversion/acquisition metrics.

### I. Advanced promotion analytics — **L**
Conversion lift · margin impact · incremental revenue · CAC relationship · new-vs-returning split ·
product/category performance · cohort behaviour · repeat purchase after coupon · promotion
profitability. **Requires data we don't capture yet**: COGS/margin (for profitability), the
session→purchase funnel (for lift/conversion), cohort tracking. Extends — does not replace — the
read-only Phase-3 attribution model. **Do not fabricate any of these** until the inputs exist.

### J. A/B testing — **L**
"10% OFF" vs "₹200 OFF" (or competing strategies) with a **statistically valid experiment framework**
(assignment, exposure logging, significance) — never random coupon switching. *Dependency:* experiment
assignment + event capture.

### K. Geo-based promotions — **M**
Eligibility by country · state · shipping zone. Coordinate with the existing shipping-zone/rate config
(`shipping_rate_version`). Resolve at application + reservation like other eligibility. Do not build
until required.

### L. Channel-specific promotions — **M**
Website · email · Instagram · QR · offline/event · influencer · CS-issued. Needs a `channel` dimension
on the coupon/redemption + issuance context; pairs with Q (unique codes) and U (QR/deep links).

### M. Personalized promotions — **L**
An individualized-offer rule engine driven by **legitimate first-party behaviour only**. **No invasive
profiling.** Gate behind explicit consent + first-party data; document the data-use boundary before any
build.

### N. Promotion approval workflow — **M**
Draft → Review → Approved → Scheduled → Active, with **role-based permissions** (extend the existing
`capabilities` RBAC + the current lifecycle state model — add `review`/`approved` between draft and
active). Trigger approval on thresholds, e.g. `discount > 30%` or `max exposure > ₹X`. Ties into O.

### O. Promotion budget / liability cap — **M**
"Max total discount spend = ₹50,000 → auto-stop the campaign." **Separate from usage count** — track
cumulative **gross discount given** (the Phase-3 analytics already computes this per coupon) against a
`budget_paise` cap and auto-pause via `setCouponStatus` when exceeded. Enforce the cap atomically in
`reserve_coupon` (same row-lock pattern as `max_uses`) so it can't be raced past.

### P. Bulk coupon operations — **M**
Bulk activate / pause / archive · export · import · batch-generated unique codes. **Mirror the existing
`bulkUpdateProducts` service pattern** (single `update … in (ids)`, audited, no N+1). Export/import as
CSV; batch generation reuses `couponCodeGen`. Feeds Q.

### Q. Single-use unique-code campaigns — **L**
Generate e.g. **10,000 one-time codes** for email / inserts / influencers / packaging / offline. Needs a
child-codes table (parent campaign → many single-use codes, each its own `max_uses = 1`), bulk generation
(`couponCodeGen`, collision-safe via the DB unique constraint), export, and per-code redemption tracking
(the redemption ledger already supports this). Consider storage/perf at 10k+ scale.

### R. Promotion calendar — **M**
Calendar view of active / upcoming / expiring / overlapping campaigns with visual conflict detection.
Read-only over existing coupon dates (`starts_at`/`expires_at`, IST) + the effective-status model.
Pairs with S.

### S. Promotion conflict simulator — **M**
Pre-publish check: "This promotion overlaps DIWALI15 between 10–12 Nov" + simulate stacking/priority
outcomes. **Reuse the canonical engine** — `couponEligibleLines` (target overlap), `canCombine`
(stacking), the auto-apply-conflict logic already in `couponWarningsService`, and date-range overlap.
Do **not** build a second conflict detector.

### T. Advanced fraud controls — **L**
Detect repeated guest identities · coupon farming · suspicious redemption patterns · excessive account
creation. The `coupon_redemptions` ledger already records the canonical `identity`
(`coalesce(user_id, 'guest:'||email)`), timestamps, and per-customer holds — the substrate for pattern
detection. **Never block legitimate customers without evidence** (flag/review, not hard-block).

### U. Coupon QR codes / deep links — **S–M**
QR / deep link that opens Samorah with the promotion pre-applied (packaging, exhibitions, influencer,
inserts). A signed deep-link that seeds the code into the cart/checkout preview flow; pairs with L and Q.

### V. Marketing automation — **L**
Abandoned-cart · win-back · birthday · post-purchase · first-purchase welcome offers. **Coordinate with
the notifications infrastructure** (see `NOTIFICATIONS_ROADMAP.md`) — issue codes via that pipeline.
**Avoid uncontrolled discount loops**: rate-limit issuance, cap exposure (O), and single-use codes (Q).

## DO NOT BUILD NOW
Unless already essentially supported, do **not** expand the current implementation into: advanced
loyalty · affiliate commission system · full referral engine · complex BOGO · geo-targeting · AI coupon
generation · personalized dynamic pricing · marketplace promotion synchronization · POS promotions · ERP
promotion integration · advanced experimentation · full marketing automation. **These live here in the
roadmap, not in the launch codebase.** Any new coupon capability must stay additive to the single pricing
engine and must never reconstruct historical financial truth from current configuration.

---

# Navigation — Post-Launch

Navigation is a `cms_revisions`-backed publishable resource (draft/published/scheduled + immutable
snapshot history). Phase 1 (integrity, RBAC edit/publish split, safe scheduling/unpublish, editor UX,
tests) is being hardened now; the items below are deferred.

### Unify Chapter/Collection lifecycle metadata with canonical CMS/catalog entities — **M**
Today Navigation validation resolves destination lifecycle for **pages** (`cms_pages.status`) and
**products** (`products.status`) — so it can BLOCK publish on an archived/unpublished/disabled
destination. **Chapters** (`HOME_CHAPTERS`) and **collections** (`AIR_VOLUMES`) are **static config with
no status field**, so those are validated **existence-only** (a missing slug blocks; there is no
Draft/Scheduled/Published/Archived state to check). Unify chapter/collection lifecycle with the canonical
CMS/catalog entity model (give them a real status, or back them by the DB `collections` table the picker
doesn't currently use) so Navigation can validate their full lifecycle rather than mere existence.
*Dependency:* a canonical status source for chapters/collections. Reuses the existing `verdictFor`
lifecycle path in `navValidation.ts` — no new validation engine.

### Device-framed navigation preview (Desktop | Tablet | Mobile) + dedicated Mobile Menu — **L**
Navigation preview already renders the REAL storefront header with the draft tree (staff cookie +
"Previewing draft" banner). Two follow-ons: (1) a Desktop│Tablet│Mobile framed switcher like the
Homepage/PDP preview; (2) the dedicated **Mobile Menu ("Component 7")** — today mobile is the same
canonical tree reflowed by CSS (one content tree feeds both, by design); a true accordion/parent-child
mobile experience is unbuilt.

### Generalize scheduled activation/deactivation to all publishable resources — **M**
The nav schedule materialization (predecessor-aware revert, atomic transition, audited) should extend to
pages/homepage (same `publishable` pattern), which are still purely read-time. Reuse the shared cron.
