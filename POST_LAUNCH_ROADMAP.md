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
