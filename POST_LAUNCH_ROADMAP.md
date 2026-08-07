# Post-Launch Roadmap

Non-blocking enhancements deliberately deferred past launch. Nothing here gates a release; each entry
records a decision made during build so it is not silently lost.

## SEO & Redirects

SEO & Redirects **Phase 1 is closed** (points 1–14: redirect-graph validation, reused Navigation
lifecycle, live-route confirmation, structured robots, canonical validation, getRouteSeo-backed
Resolved-SEO + inheritance, field reset, exact-state Undo, cross-tab isolation, content.edit/
content.publish RBAC, enriched audit). The items below are **intentionally deferred to Phase 2+** and
must **not** reopen Phase 1.

### 🔒 Invariant — one SEO backend (do not violate in any future phase)
`/admin/seo` (SeoRedirectsManager) and `PageSeoPanel` **must continue to share the canonical SEO
persistence + resolution backend**: the `seo_overrides` table, `seoRedirectService` (`upsertSeoOverride`
/`getRouteSeo`/`withRouteSeo`/`getEffectiveSeo`), and the single redirect engine (`redirects` table →
`lib/redirects` → middleware). **Any future UI unification must NOT create a second SEO/metadata
resolver, a second redirect engine, or a parallel persistence path.** Effective/preview metadata must
always come from `getRouteSeo`/`getEffectiveSeo`, never a component-local re-computation.

### Phase 2 status
**Done in Phase 2:** sitemap priority/changefreq wiring + exclusions (override-noindex / redirect
sources / coming-soon chapters) via a single batch query; redirect edit identity (update-by-id);
deterministic redirect health + search/filter/sort; shared SEO primitives + PageSeoPanel consistency
(same backend/validation/confirmation + getEffectiveSeo baseline + draft-overlay preview); editorial
Meta UX. The **PageSeoPanel ↔ /admin/seo consistency** item is therefore resolved — both share the
backend AND the confirmation/effective/provenance semantics; JSON-LD stays PageSeoPanel-only by design.

### Still deferred (confirmed post-launch)
- **Real redirect hit instrumentation** — DEFERRED by decision. The audit established there is **no
  reliable Edge non-blocking write** (middleware is Edge, no `waitUntil`, no atomic increment RPC, no
  counter/flush), so building Edge→Node ingest→DB/cron plumbing solely for pre-launch counts is not
  justified. `hits`/`Last hit`/`Most hits`/`Recently hit` and traffic-based health stay **hidden** (no
  zero shown as measured traffic). When built: add `last_hit_at` (+ maybe `updated_at`) or a single
  rollup table, a best-effort write path, and a flush/rollup cron — one hit store, never blocking the
  301/302. `redirect_health` never becomes a delete recommendation.
- **`redirects.updated_at`** — intentionally NOT added in Phase 2 (a "Recently updated" sort alone
  didn't justify it; edit identity is handled by update-by-id). Add only if genuinely needed for
  identity/audit semantics.

### Lifecycle audit (read-only finding — do NOT change storefront services without approval)
Matrix from Phase 2 analysis (recorded for a future, separately-approved pass):
- **Products** — `getShopProducts` (anon/**RLS-only**, no explicit status filter, `status` not
  selected). Visibility is RLS-implicit — fragile if any admin-client query reuses it.
- **Collections/Chapters** — `getCollections` applies **no `is_coming_soon`/`is_active` filter**, so
  coming-soon chapters would leak. Phase 2 fixed this **only locally in `sitemap.ts`** (storefront
  services untouched).
- **CMS pages / air volumes** — consistent (`isPageLive`; config `!isComingSoon`).
- **SEO/Nav entity picker** — `listLinkableEntities` caps products at **`.limit(200)`** (scalability
  note; not solved now).
These are audit findings only — no storefront visibility/RLS/service change was made in Phase 2.

### Phase 3 status + deferrals
**Done in Phase 3 (P0/P1/P2):** storefront `withRouteSeo` override round-trip tests; SEO override
route-existence validation (typo → confirm, reusing `classifyHref`); `/about`+`/journal` in the sitemap;
application-level non-production `noindex` (`robotsForEnv` via `VERCEL_ENV`); custom JSON-LD emission
fix for /about & /journal (mechanism A); Air PDP `Product` schema via the shared builder; real
`middleware()` redirect tests; structured-data regression suite; `BreadcrumbList` on product/chapter/
collection; explicit-override duplicate-metadata warning; accessible tabs.

**Explicitly deferred to post-launch (do not implement without a new request):**
- Full-site SEO crawler/audit and **sitewide** duplicate title/description detection (Phase 3 shipped
  only *explicit-override* duplicate detection — effective titles of un-overridden routes aren't stored).
- Bulk redirect CSV import/export (dry-run, row errors, dup + loop/chain validation, preview).
- Redirect traffic/hit instrumentation + analytics UX + traffic-based health (Edge/no-`waitUntil`).
- Full SEO revision/version engine (audit + inherited-reset + Undo remain sufficient).
- `Article`/`BlogPosting` schema — until individual journal-article routes/content exist.
- Generalized CMS-page sitemap discovery (Phase 3 added `/about`+`/journal` as known routes only).
- Generalized product/collection lifecycle/RLS/service changes; product-picker `.limit(200)` redesign.

### ✅ Resolved — external redirect destinations blocked (P1-8)
The redirect **middleware is same-origin by design** (sets `pathname` on a clone of the canonical-origin
URL), so external destinations never function — a `javascript:`/external `to` becomes a same-origin path
(proved by `middleware.integration.test`). Phase 3 aligned the canonical redirect analysis path to this
reality: absolute external URLs and protocol-relative `//…` destinations are now a **blocking** error
(server-enforced in `upsertRedirect`), unsafe protocols stay blocked, internal paths still validated by
the canonical lifecycle rules. The middleware was **not** changed (kept as defense in depth). No
external-redirect capability exists or is planned.

### Known boundary (accepted, documented)
A `noindex` set **only** inside a route's own `generateMetadata` (never written to the `seo_overrides`
layer) is not centrally discoverable by the sitemap. We do **not** re-run every route's
`generateMetadata` to find it; the override layer is the deterministic signal the sitemap acts on.

## Email

### Unify preheader / message-envelope handling across coded-default and authored emails
**Status: non-blocking · post-launch. Not required for Phase 1 closure.**

Today the transactional email "envelope" is handled in two places by design:

- **Subject** — a published CMS override applies to *both* the coded-default email and an authored
  body (via `resolveSubject` on the canonical send path).
- **Preheader (and hero/eyebrow/heading/blocks)** — apply only when an operator authors a full body
  (rendered by `renderEmailBlocks`, which emits the hidden preheader span). The **coded-default**
  builders (`emailLayout` / `build*` in `src/lib/email/`) do **not** consume a CMS preheader.

This split is intentional. Wiring a CMS preheader into the coded-default path would mean modifying the
protected transactional fallback (`compose` / `build*`) — the exact path that guarantees an invalid or
missing customization can never stop an Order Confirmation from going out. Phase 1's scope rule was to
stop and defer rather than code around that fallback.

**Future option (only if desired):** introduce a single message-envelope abstraction (subject +
preheader + from/reply-to) that both the coded-default and authored renderers consume, so a CMS
preheader could apply to the coded default too — without duplicating a renderer or weakening the
fallback guarantee. Must preserve: coded-default emails always send even with no/invalid customization;
one renderer and one token path; no second email system.

### Email Templates list — categories + search
**Status: non-blocking · post-launch. (Phase 2 point 15, intentionally deferred.)**

Seven transactional templates don't need search/filter today. When templates expand into payment,
gift-card, account, wholesale, review, loyalty, etc., group them by category and add a search box on
`/admin/emails`. Pure UI/list concern — no schema or send-path change implied.

### Delivery Log authorization — move to an operational capability
**Status: non-blocking · post-launch. Acceptable under current RBAC; refine later.**

The customer-email Delivery Log (`/admin/emails/deliveries`) is gated by `content.edit` today, reusing
the Email CMS capability. But delivery records are operational/customer data, not template *content* —
editing copy and viewing who-was-emailed-and-whether-it-failed are conceptually different rights.
Longer term, gate delivery records by an **operational** capability (e.g. `notifications.view` or
`orders.view`) rather than `content.edit`. Do **not** stand up a new RBAC architecture solely for this;
fold it in when operational-visibility capabilities are next revisited. Recipients are already masked
and provider errors redacted, so the current exposure is bounded.

### Delivery Log → failed-job deep-link (NOT built — verified limitation)
**Status: non-blocking · post-launch. Requires a schema decision; do not reconstruct heuristically.**

Phase 2 point 13 envisioned a "View failed job" link from a failed delivery to its canonical
fulfillment job. **Verified against the schema: `notification_dispatches` stores no fulfillment-job
reference** (no `fulfillment_job_id`; the row is upserted in place). The only mapping would be a
heuristic `(order_id, event) → fulfillment_jobs(order_id, job_type)` guess — and `job_type`
(`email`/`dispatch_email`/`cancellation_email`) doesn't map 1:1 to events. Per the architecture rule
we did **not** fabricate this correlation. The Delivery Log instead surfaces the failure status/error
and deep-links to the stored order/return, and documents that retry is owned by the fulfillment queue.

If a first-class link is ever wanted, the correct fix is a **stored** reference: add a nullable
`fulfillment_job_id` (or a shared correlation id) written at dispatch time on the send path. That is a
send-path + schema change — deferred, and must not weaken the transactional fallback.

## Inventory

Inventory **Phase 0 (canonical ledger + reservation-safe adjustment) and Phase 1A (operations UI +
authority switch) are closed**. The items below are deferred and must **not** reopen Phase 0/1A
invariants (single stock authority, append-only ledger, lifecycle-protected adjustment floor).

### Idempotent adjustment replay — echo the canonical persisted result
**Status: non-blocking · post-launch P3 · technical-correctness polish. NOT a stock-integrity blocker.**

Current safety: a concurrent/retried `adjust_inventory` call with the **same** idempotency key mutates
`variants.stock` **exactly once** and writes **exactly one** `inventory_movements` row (variant row-lock
+ unique partial index on `idempotency_key`). Proven by the concurrent same-key local-DB integration test
(final On Hand correct, one movement).

Known cosmetic limitation: the *second* concurrent duplicate operation returns its **pre-empted target**
(the `on_hand` it computed from its own pre-lock read) rather than the already-persisted canonical result
for that key. The **database state is correct and single-applied**; the admin UI refresh resolves to
canonical stock. This is a response-shape nuance, not a correctness or stock-integrity issue.

Future enhancement: on an idempotency-key hit, re-read and return the **already-persisted** movement/result
for that key so a duplicate replay echoes canonical state. **Do NOT modify the Phase-0
`adjust_inventory`/`apply_stock_movement` RPCs solely for this** until it is explicitly scheduled.

### `variants` column-privilege migration rule (permanent developer rule)
**Status: standing architectural rule — applies to EVERY future migration touching `public.variants`.**

Phase 1A intentionally revoked direct `UPDATE(stock)` on `public.variants` from the API/service role: the
table-level `UPDATE` was dropped and re-granted per-column for every column **except `stock`**. Physical
On Hand therefore mutates **only** through the canonical ledger functions (`apply_stock_movement`, called
by `adjust_inventory`/`finalize_order`/`cancel_order`/`restock_return_items`), which run `SECURITY DEFINER`
as the table owner and so bypass the grant. Enforced in
`supabase/migrations/20260817120000_inventory_authority.sql`.

**Rule:** any future migration that ADDS an editable column to `public.variants` MUST issue an explicit
`GRANT UPDATE(<col>) ON public.variants TO service_role` (or re-run the dynamic all-but-`stock` grant), or
product/admin saves of that column will be refused. **`variants.stock` must remain excluded from direct
`UPDATE` permanently** — it may change only through the inventory-ledger functions. This is a developer
migration rule, not a feature.

### Replacement / exchange — outbound inventory orchestration (Phase 2)
**Status: real remaining inventory workflow gap — deferred from Phase 1B (decision D6).**

A return with `return_type`/`resolution` of `replacement`/`exchange` reships goods but currently creates
**no outbound inventory consequence**: `advanceReturn`'s `replacement_shipped` transition performs no
order/shipment/stock decrement (`returnService.ts`). The replacement units are never debited from
`variants.stock`. Phase 1B (returns/RTO **inbound** physical disposition) deliberately does NOT build
this — it is an outbound order-creation concern, not inbound disposition. **Phase 2 must add canonical
outbound inventory for replacements/exchanges** (a real replacement order/shipment that decrements stock
through the ledger `sale`/canonical path), so a replacement is not silent stock leakage.

### Shipping webhook authenticity + provider-event-id dedup (hardening)
**Status: hardening — do NOT expand Phase 1B into rebuilding the shipping integration.**

`/api/webhooks/shipping/[provider]` authenticates with a single shared secret
(`SHIPPING_WEBHOOK_SECRET`), with **no per-provider HMAC/signature verification** and **no
provider-event-id dedup** (no stored event id / raw payload). Idempotency today rests only on the
shipment state-machine transition guard (a repeated terminal event is a benign illegal-transition
no-op). Harden later: per-provider signature verification (a real Shiprocket adapter) + a stored
provider event id for true webhook dedup. **RTO stock must remain inspection-driven and is NEVER
webhook-restocked**, so this hardening does not gate RTO inventory correctness — it is provider-integrity
polish.

### Late-payment (post-cancellation) — observability + state-semantics review
**Status: post-launch — optional. The 1B-0a compensation is correct and tested without these.**

Phase 1B-0a makes a capture landing after order cancellation refuse resurrection (finalize terminal guard)
and auto-refund the captured amount via the canonical refund service. Deferred refinements:
- **Observability:** an optional dedicated operational event / dashboard metric for SUCCESSFULLY
  auto-compensated late payments (today: audit `order.late_payment_refund_initiated` + the refund
  service's own `refund.initiated`/`refund.failed`; the failed case is the loud, actionable one).
- **Payment-state semantics:** a captured-then-refunded-after-cancellation order is recorded as
  `payment_status='failed'` (never legitimately paid in our system), with the money truth in the
  `refunds` + `payment_attempts` ledgers. If future payment flows grow more complex, review whether
  order-level `payment_status` should distinguish this from an ordinary failed payment. Do NOT add a
  status now — no consumer defect requires it. **Known cosmetic classification (deferred, not 1B-0a):**
  such an order is counted as a *failed payment* in reporting (e.g. `customerAdminService` failed-payment
  tally) even though it was captured-then-refunded — a future payment-lifecycle/reporting refinement.
- **Payment-attempt dedup semantics:** `payment_attempts.razorpay_payment_id` is UNIQUE with
  `on conflict do nothing`, so a gateway/webhook retry of the same capture yields ONE canonical record
  (verified). Documented as intended behaviour (unique capture, not append-only event history).

### Phase 1B-0b — inbound receipt concurrency (build-time requirement, not deferred)
When 1B-0b lands the header+items inbound-receipt model, the restock-commit MUST enforce, under the
variant/receipt lock, that Σ received_qty across all receipt-items for a (source, variant) can never
exceed expected_qty — a **simultaneous-partial-receipts** test is required. Recorded here so it is not lost.
*(Delivered in `20260819120000_inbound_receipts.sql`.)*

### Phase 1B-1 — Returns stock-authority cutover (MANDATORY requirements; not built in 0b)
The inbound-receipt foundation (`commit_receipt`, migration `20260819120000`) is frozen. When 1B-1 wires
the **Returns** workflow onto it, these are non-negotiable:
- **R1 — Atomic authority switch.** The old `restock_return_items` / automatic Return restock and the new
  receipt-driven restock must NEVER both be authoritative. Switch atomically in ONE release/change set:
  old Return auto-restock OFF **and** receipt-driven ON, with regression proving **neither double-restock
  nor missing-restock**.
- **R2 — Historical / pre-cutover Returns.** Before cutover, inspect/classify existing Return records for
  stock already restored; never let a receipt double-restock a historical return. If there are zero
  applicable production returns, **prove/report** it rather than assume.
- **R3 — Missing/shortage.** Keep 0b's no-mutable-`missing_qty` design; final shortage is determined only
  at explicit Return receiving **closure**: `final_missing = canonical_expected − cumulative_received`.
- **R4 — Domain RBAC.** Return receipt create/edit/commit gated by **`returns.operate`** (RTO:
  `fulfillment.operate`), **never `inventory.adjust`**. Restock movements remain system/domain movements.
- **R5 — No new stock engine.** 1B-1 only creates/manages receipts + calls the frozen `commit_receipt`;
  no direct `variants.stock` write, no separate Return inventory-mutation implementation.

### Phase 1B-1 — Returns receiving CLOSED & FROZEN (commit `c581afc`, migration `20260820120000`)
Delivered: `requiresPhysicalReturn` authority, receipt-driven restock, atomic removal of the
`restock_return_items` caller (function left callerless), return-row-lock commit-vs-close serialization,
DB closure triggers (`source_type='return'` only), open-draft protection, per-variant derived missing,
legacy-restock guard, `returns.operate` RBAC. **Do not rewrite `20260820120000`; corrections are later
additive migrations only.** The following remain **independent, still-open inventory items** (each is a
separate future decision, none gates any release):

1. **Replacement/exchange OUTBOUND inventory decrement authority** — unchanged and still open (see
   "Replacement / exchange — outbound inventory orchestration" above). 1B-1 covered inbound only; a
   `replacement_shipped` transition still performs no stock decrement. A future canonical outbound
   order/shipment must debit `variants.stock` through the ledger `sale` path.
2. **Inventory valuation / COGS** — deferred until a canonical **cost authority** exists. No unit COGS,
   reverse-logistics cost, or cost/loss analytics is tracked (the Return finance card says so). Do not
   infer valuation from price; build only atop a real cost source.
3. **Returns receiving recovery model — intentional VOID-AND-RESUBMIT (accepted, do not change).**
   `receiveReturnGoods` is atomic create+commit: a commit that fails authoritatively (over-receipt,
   concurrent outstanding change, closed boundary) **voids** the just-created receipt — zero movement, no
   stranded draft — and the operator corrects the **retained form values** and submits a **fresh** receipt.
   This is the canonical recovery semantics; **do not convert it to persistent editable failed drafts.**
4. **Missing / shortage stays DERIVED per variant** — `final_missing = canonical_expected − cumulative
   committed received`, computed per variant at/after closure from immutable receipt history. Only
   `receiving_closed_at`/`receiving_closed_by` are persisted. **No scalar `receiving_shortage`/`missing_qty`
   column** is to be introduced for convenience; a structured per-variant breakdown lives in the
   `return.receiving_closed` audit event.
5. **No WMS / no new stock engine** — `commit_receipt` remains the shared receiving authority and
   `apply_stock_movement` the sole mutation choke point. No warehouse-management system and no parallel
   stock engine unless a future operational requirement explicitly justifies (and re-approves) one.

### Phase 1B-2 — RTO receiving (shipment-anchored closure; built)
RTO physical receiving reuses the SAME frozen foundation: `inventory_receipts(source_type='rto',
source_id=shipments.id)` → `commit_rto_receipt` → `commit_receipt` → `apply_stock_movement` (`rto_restock`,
key `rto_receipt_item:<id>`). No RTO-specific stock engine. Closure is shipment-anchored
(`shipments.rto_receiving_closed_at/by`, `close_rto_receiving`, `commit_rto_receipt`, two
`source_type='rto'` guard triggers) in additive migration `20260821120000` — the frozen
`source_type='return'` closure (…20) is untouched and its triggers return early for RTO. `shipments.status`
stays terminal `'rto'`; receiving/closure is a separate inventory-accounting concern. RTO issues no
refund/payment/invoice — financial handling stays independent.

#### 🔒 Architectural dependency — RTO expected-quantity authority (one shipment per order)
**RTO expected-quantity authority currently depends on one shipment per order. Before
multi-box/multiple-shipment support is introduced, shipment-level item allocation must become the
expected-quantity authority for RTO receiving.** Today `commit_receipt`'s RTO branch derives expected
= `SUM(order_items.quantity by variant)` via `shipment → order_id`, correct ONLY because
`shipments.order_id` is `UNIQUE` (one parcel per order). A future multi-box slice that drops that
constraint MUST first introduce a `shipment_items` allocation table and migrate RTO expected-quantity
derivation from order-level to shipment-level, or each parcel's RTO would over-expect the whole order.
An invariant test (`rtoReceiving.integration.test.ts` req1) guards the current assumption.

#### Prepaid-RTO refund automation — future Orders/Refunds concern (NOT coupled to receiving)
An RTO parcel that bounces back means a prepaid customer may be owed a refund, but that is a
**business-policy / Orders + Refunds** decision, handled today by the existing manual refund route. It
**must never be coupled to inventory receiving**: RTO receive/commit/close deliberately mutate no
refund/payment/order-financial state (proven by `rtoReceiving.integration.test.ts` req4 + closure V1). Any
future prepaid-RTO auto-refund lives in the Orders/Refunds domain and reuses the canonical refund service —
it does not belong in the receiving service or RPCs.

---

## Inventory — Phase 1B CLOSED · Phase 2+ Roadmap (classified)

**Inventory Phase 0 → 1B-2 is complete and FROZEN.** Commits: `e035fd3` (P0 ledger) · `48f0c3b` (1A authority)
· `9e2db46` (1B-0a payment/reservation) · `0f22575` (1B-0b receipt foundation) · `c581afc` (1B-1 Returns) ·
`484cc6d` (1B-2 RTO). Migrations `20260816120000 … 20260821120000` are **immutable** — any correction is a
**later additive migration only**. This section is the agreed post-launch roadmap: **documentation, not a
work order.** Nothing below is approved to build; each item carries an explicit trigger. Priorities are
relative importance, **not** a schedule (no dates).

### A. Frozen Inventory architecture (the permanent authority model)

Every stock change in the system flows through exactly one choke point. This is the invariant all future
work inherits:

```
Manual corrections   → adjust_inventory        → apply_stock_movement → manual_adjustment
Sales                → order finalization       → apply_stock_movement → sale
Order cancellation   → cancel_order             → apply_stock_movement → cancel_restock
Return receiving     → commit_return_receipt    → commit_receipt → apply_stock_movement → return_restock
RTO receiving        → commit_rto_receipt       → commit_receipt → apply_stock_movement → rto_restock
New-variant opening  → variants opening trigger → apply_stock_movement → opening_balance
```

- **`apply_stock_movement` is the ONLY writer of `variants.stock`** (Phase-1A column-privilege revoke; the
  ledger functions are `SECURITY DEFINER`). `inventory_movements` is the **immutable append-only ledger** and
  the single source of stock-movement truth. `commit_receipt` is the **shared inbound receiving authority**
  (Returns + RTO); receiving RBAC is `returns.operate` (Returns) / `fulfillment.operate` (RTO), never
  `inventory.adjust`.

**🔒 Hard non-goals — no Phase 2+ feature may EVER introduce:** direct `variants.stock` mutations · a second
inventory ledger · a second receiving engine · a parallel adjustment engine · raw ±stock controls inside the
Returns/RTO workflows · duplicated/denormalized stock balances. All analytics and reports **derive** from the
canonical ledger — they never become a second inventory truth.

### B. Phase 2A — operational improvements (post-launch candidates)

All read/report or reuse the canonical adjustment path; none introduces a new stock authority.

- **Inventory snapshot CSV export** — On Hand / Reserved / Available per variant.
  · Priority **P2** · Trigger: ops asks to work stock offline / share with finance · Dependency: none ·
  Reuses: `inventoryService` read model (ledger-derived) · Non-goals: no editable import-back, no stock mutation.
- **Movement-history CSV export** — export `inventory_movements` rows.
  · Priority **P2** · Trigger: audit/finance needs an exportable ledger · Dependency: none · Reuses:
  `inventory_movements` ledger · Non-goals: not a second ledger store; export is a projection only.
- **Rich ledger filtering/search** — by date, SKU/product, movement type, source/reference, actor.
  · Priority **P2** · Trigger: ledger volume makes the flat list hard to navigate · Dependency: none ·
  Reuses: `inventory_movements` + existing indexes · Non-goals: no derived balances stored; filter is read-only.
- **Physical-count / reconciliation workflow** — count sheet → variance → apply corrections.
  · Priority **P2** · Trigger: first real cycle-count need · Dependency: none · Reuses: **`adjust_inventory`**
  (`manual_adjustment`) exclusively for every correction · Non-goals: no direct stock write, no bulk bypass of
  the reservation-safe floor, no separate count-ledger authority.
- **Low-stock-threshold management / bulk editing** — edit `low_stock_threshold` across variants.
  · Priority **P3** · Trigger: catalog grows enough that per-variant editing is tedious · Dependency: none ·
  Reuses: existing variant column-grant rules (threshold is editable; `stock` is not) · Non-goals: never grant
  `UPDATE(stock)`; thresholds don't move stock.
- **Modest operational Inventory dashboard** — low/out-of-stock, recent adjustments/receipts, receiving exceptions.
  · Priority **P3** · Trigger: ops wants an at-a-glance operational view · Dependency: ledger + receipts ·
  Reuses: ledger/receipt read models · Non-goals: not analytics/valuation; no new truth; purely a projection.
- **Ledger reconciliation MONITOR** — read-only check that `opening_balance + Σ movement deltas == current On Hand`
  per variant; **alerts/reports** discrepancies.
  · Priority **P2** · Trigger: desire for continuous integrity assurance post-launch · Dependency: none ·
  Reuses: `inventory_movements` + `variants.stock` (read only) · **Non-goals: NEVER auto-repairs inventory** —
  it reports drift for human investigation; it must not write stock or movements.

### C. Phase 2B — build only when operational volume justifies it

- **Inventory valuation** — **BLOCKED** until a canonical unit-cost/cost authority exists.
  · Priority **P3 (blocked)** · Trigger: a real cost source + finance requirement · Dependency: **cost authority
  must be defined first** · Reuses: (future) cost authority + ledger quantities · **Non-goals: never use selling
  price as inventory cost; no valuation inferred from `price`.**
- **COGS support** — only after cost authority + accounting semantics are approved.
  · Priority **P3 (blocked)** · Trigger: approved accounting model · Dependency: valuation/cost authority ·
  Reuses: ledger movements + cost authority · Non-goals: no COGS math on price; not an inventory-owned decision.
- **Supplier / Purchase Order / Goods-Received workflow** — inbound procurement.
  · Priority **P3** · Trigger: **manual replenishment becomes operationally insufficient** · Dependency: none
  technical (business process trigger) · Reuses: the receipt foundation pattern (`commit_receipt` family) for GRN
  restock, a NEW source_type if built · Non-goals: **do not build procurement/ERP merely because a ledger now
  exists**; no PO engine before real supplier volume.
- **Inventory movement analytics** — trends/velocity derived from `inventory_movements`.
  · Priority **P3** · Trigger: enough sales history to be meaningful · Dependency: sales history · Reuses:
  `inventory_movements` (derive only) · Non-goals: no second inventory truth; analytics is a projection.

### D. Scale-triggered architecture — NOT normal Phase 2 (build only when the trigger is real)

- **Multi-shipment / multi-box** — one order → multiple parcels.
  · Priority **P3 (scale)** · **Trigger: an order genuinely needs >1 shipment** · Dependency: introduce
  `shipment_items` (or equivalent) shipment-level allocation FIRST · Reuses: `commit_receipt` · **Non-goal /
  required migration:** RTO expected-quantity must then derive from the **shipment allocation, not all
  `order_items`**; today `shipments.order_id` is `UNIQUE` and the RTO expected authority depends on it (guarded
  by `rtoReceiving.integration.test.ts` req1). Dropping that 1:1 without shipment-level allocation is forbidden.
- **Multi-location inventory** — independently stocked warehouses/3PLs.
  · Priority **P3 (scale)** · **Trigger: Samorah actually operates >1 independently stocked location** ·
  Dependency: location model · Reuses: ledger pattern extended per-location · **Non-goal: do not change the
  current variant-level single-stock authority until real multi-location operation exists.**
- **Batch / lot tracking** — per-batch identity/expiry/QC.
  · Priority **P3 (scale)** · Trigger: production/QC/traceability/regulatory requirement · Dependency:
  batch model · Reuses: ledger movements tagged by batch · Non-goal: not added speculatively.
- **WMS** — bin locations, putaway, pick waves, transfers, scanning.
  · Priority **P3 (scale)** · Trigger: warehouse operational scale demands it · Dependency: multi-location/volume
  · Reuses: ledger as system-of-record · **Non-goal: explicitly out of scope until scale requires it; the
  receiving UI is NOT a WMS.**

### E. Cross-module dependencies — NOT owned by Inventory

Inventory provides stock **primitives/data**; it must **not** become the policy authority for these:

- **Prepaid-RTO refund automation** → **Orders/Refunds** (reuses the canonical refund service; decoupled from
  receiving — proven by 1B-2 req4/V1). · Priority P3 · Trigger: refund-policy decision.
- **Replacement/exchange OUTBOUND stock workflow** → **Returns/Orders/Fulfillment** (a real replacement
  order/shipment that debits stock via the ledger `sale` path). · Priority **P2** · Trigger: stop silent stock
  leakage on `replacement_shipped` · Dependency: outbound order creation · Reuses: canonical `sale` path ·
  Non-goal: not solved inside the Returns receiving service.
- **Payment/refund policy** → **Payments/Refunds**. · Non-goal: Inventory never decides money.
- **Demand forecasting / reorder recommendations** → **future analytics** after sufficient real sales history.
  · Priority P3 · Trigger: enough sales history · Dependency: sales data · Non-goal: no forecasting before data.

### F. Engineering / test hygiene

- **Sequential integration-test execution (shared local DB).** The inventory integration suites
  (`inventoryLedger` · `paymentReservationHardening` · `inboundReceipts` · `returnReceiving` · `rtoReceiving`)
  share ONE local Postgres and use broad `afterAll` cleanups; under Vitest's default parallel file workers those
  cleanups can race across files (a broad `DELETE … WHERE status='rto'` in one suite can delete another suite's
  in-flight rows). **They must be run sequentially — `vitest run --no-file-parallelism`** — or one file at a time.
  **Current state (verified this pass): NOT encoded** — `package.json` `test` is plain `vitest run`,
  `vitest.config.ts` sets no pool/parallelism options, and there is no CI workflow. The suites are env-gated
  (`INV_TEST_*`), so plain `npm test` skips them and never flakes; the race only appears when a developer runs
  several integration files together with the env set.
  · Priority **P2 (engineering hygiene)** · Trigger: before these suites run in any automated/CI pipeline, or
  when a dev hits the flake · Dependency: none · Reuses: existing suites · **Non-goal (this pass): do not
  redesign the tests now.** Future fix options: a dedicated `test:integration` script pinning
  `--no-file-parallelism`, a project in `vitest.config.ts` scoping `*.integration.test.ts` to a single
  fork/thread, or per-suite tag-scoped cleanup — pick one so determinism doesn't rely on developer memory.

### G. Launch deployment — a launch-readiness task, NOT Phase 2 product work

**The frozen local migrations `20260816120000 … 20260821120000` have NOT yet been applied to the hosted
production database** (all Inventory work to date is local-only; hosted was never mutated). Their **controlled
production deployment, migration verification, post-deployment inventory reconciliation, and smoke testing** are
**launch/deployment tasks** — they are **not** deferred product functionality and must not be listed as Phase 2
enhancements. (Note also the standing GA4/WIF post-deploy wiring reminder is a separate launch task.) This
roadmap section is about *future features*; shipping the already-built, already-frozen ledger to production is
part of *launching what exists*.

### H. Classification key

Every item above carries: **Priority** (P1 launch-critical / P2 near-term post-launch / P3 later or
scale-gated) · **Trigger** (the real condition that should cause it to be built) · **Dependency** · **Canonical
authority it must reuse** · **Explicit non-goals**. No item is dated. **P1 items: none remain in Inventory
product scope** — Phase 1B closed the launch-critical inventory work; the only launch-blocking Inventory item is
the deployment task in (G), which is launch-readiness, not a feature. Deviating from a listed canonical authority
or non-goal requires a new, explicitly-approved architecture decision — not an incremental change.

## Bundle CMS (Phase 1B — post-launch / Phase-2 items)

Recorded during Bundle CMS P1B. None blocks launch. Each must preserve the frozen Bundle foundations:
one `BundlePageView` renderer · `usePreviewBundleController` isolation (no cart/composition persistence,
no analytics, no reservation) · Media authority (config stores media ids) · canonical
identity/availability/pricing/SEO · shared `cms_revisions` · P1A server RBAC.

- **Accurate responsive Bundle preview modes** — Priority **P2**. The Admin side-by-side preview renders
  the real `BundlePageView` **in-DOM** (not an iframe), so the Tablet/Mobile device buttons scale the
  preview *width* but cannot independently trigger the storefront's **window-level** media queries — only
  the Desktop preview re-lays-out faithfully. Trigger: an operator needs pixel-accurate tablet/mobile
  preview. Any solution MUST keep `BundlePageView` as the renderer + the isolated preview controller (e.g.
  a same-origin preview route in a sized iframe rendering the SAME component + streamed draft) — **no
  duplicate renderer, no real commerce**. Not a P1B blocker.
- **Bundle CMS editor→preview section focus/navigation** — Priority **P2**. Selecting Hero / Vessel /
  Candle / Merchandising in the editor does not yet scroll/focus the corresponding preview section. Must
  reuse the existing renderer/controller seam (e.g. preview-only section anchors + a focus prop), not a
  second preview/state system. Not a P1B blocker.
- **Shared MediaPicker accessibility** — Priority **P2 (shared Admin/Media, not Bundle-specific)**. The
  shared `MediaPicker` closes via its Close button but not the Escape key; verify focus-return-to-opener
  and modal focus containment. A cross-cutting Admin/Media UX improvement — do not fork the shared picker
  for Bundle. Not a P1B blocker.
