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
