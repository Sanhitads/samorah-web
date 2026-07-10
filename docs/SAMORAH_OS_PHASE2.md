# Samorah OS — Phase 2 (Business Operating System) — Tracking

> Source: **Samorah_OS_Phase2_Specifications.pdf** (19 points + Managers, CRM, Reports).
> Goal: refactor the admin from operations-only into a full business OS with a
> **CMS-first** spine — every storefront page, section, product, policy, nav, SEO
> field and email template editable **without code changes**.
> Companion trackers: [`SLP_COVERAGE.md`](./SLP_COVERAGE.md) (logistics), this doc (Phase 2 OS).
> Legend: ✅ done · 🟡 partial (foundation exists) · ⬜ not built.

## Honest status vs the 19 points
Much of the "missing" in the source PDF already shipped in the SLP + admin waves.
This maps each point to reality so we **enhance, not rebuild**.

| # | Point | Status | What exists / what's missing |
|---|---|---|---|
| 1 | **Dashboard** — business KPIs + activity timeline | 🟡→ | KPI tiles + operational metrics ✅; **business KPIs** (today revenue/orders/AOV, top product, low-stock, pending emails, failed payments) + **inline activity timeline** ⬜ |
| 2 | **Orders** — ops tools | 🟡 | list + detail + timeline + cancel/refund + payment badge ✅; **search/filters, saved views, CSV export, resend email, duplicate, tags, internal notes, expandable row, print invoice, GST/high-value/fraud badges** ⬜ |
| 3 | **Fulfillment** — attributes + batch | 🟡 | board + pick/pack/QC/dispatch + assignee + priority/tags ✅; **picker/packing-slip/box-size/courier/label/weight/QC-flag/photo + BATCH ACTIONS** ⬜ |
| 4 | **Returns** — workflow data | 🟡 | state machine + restock + refund + audit ✅; **reason photos, customer images, QC notes, refund method/txn display, partial refund, exchange/replacement outcomes, return shipping cost, approver, timeline** ⬜ |
| 5 | **Shipments** — real fields | 🟡 | lifecycle + POD + webhook + AWB/label/tracking + weights ✅; **pickup date, expected delivery, delivery attempts, insurance, COD collected, manifest, webhook-status display** ⬜ |
| 6 | **Products** — full model | 🟡 | core + variants CRUD + status/featured ✅; **full editorial/media/SEO/fragrance/cross-sell/visibility fields** ⬜ |
| 7 | **Product Editor** — tabs | ⬜ | single modal today; needs **tabs** (General/Media/Variants/Fragrance/Editorial/SEO/Inventory/Shipping/Related/Publishing) |
| 8 | **Coupons** — advanced | 🟡 | CRUD + usage/first-order/auto-apply + percent-cap ✅; **priority, stackable, campaign, analytics/redemptions, segments, product/collection-specific, exclude-sale, per-customer, hidden** ⬜ |
| 9 | **Inventory** — WMS | ⬜ | "Soon"; needs stock ledger, POs, suppliers, adjustments, transfers, receiving, cycle counts, damages, reserved/incoming/available, audit |
| 10 | **Warehouses** — expanded | 🟡 | CRUD + routing + serves_states + manager/phone/hours ✅; **cutoff time, inventory summary, capacity, zones, packaging profiles** ⬜ |
| 11 | **Settings** — full | 🟡 | shipping settings ✅; **general site settings** (Brand/GST/Support/Email/Domains/Policies/Taxes/Payment/Invoices/Returns/SEO/Analytics/Social/Integrations) in DB ⬜ |
| 12 | **CMS** — content management | ⬜ | **the headline gap.** Homepage/Collections/Chapters/Pages/Nav all config-driven in code; needs DB content model + editors |
| 13 | Warehouses cutoff/summary | 🟡 | (folds into #10) |
| 14 | **Packaging** — richer | 🟡 | assets/profiles/rules/inventory CRUD ✅; **type vocab expansion, images, assembly steps, version, reusable, lead time, barcode, cost history** ⬜ |
| 15 | **Rules Engine** — more | 🟡 | trigger→condition→action CRUD + dry-run ✅; **more triggers (order.paid/shipment.delivered/inventory.low…), more actions (slack/sms/create-shipment/print-label)** ⬜ |
| 16 | **Shipping Settings** | 🟡 | provider/strategy/thresholds/fragile/volumetric ✅; **default package, label size, auto-insurance, webhook-retry-count** ⬜ |
| 17 | **Analytics** — business | 🟡 | operational + revenue/RTO/returns ✅; **profit/margin, LTV, repeat rate, sell-through, ROAS, orders-by-state map, forecast** ⬜ |
| 18 | **Activity** — filters | 🟡 | feed ✅; **filters (user/module/date/severity), search, export, details drawer, colour coding** ⬜ |
| 19 | Inventory (dup of #9) | ⬜ | see #9 |

## New modules (from Managers / CRM / Reports)
| Module | Status | Note |
|---|---|---|
| Customer Management (CRM) | ⬜ | customer page: orders/addresses/returns/wishlist/LTV/AOV/segments/tags/notes/consent/GST/tickets |
| Reports | ⬜ | revenue/orders/AOV/repeat/top products/refund rate/courier/coupon/tax/GST/inventory/stock-aging |
| Media Library | ⬜ | upload/crop/alt/folders/tags/usage/replace |
| SEO Manager | ⬜ | per-page canonical/meta/OG/JSON-LD/robots/sitemap |
| Email Template Manager | ⬜ | edit templates as content, not HTML |
| Homepage Builder | ⬜ | drag sections |
| Navigation Manager | ⬜ | header/footer/mega-menu links + order + visibility |
| Announcement Manager | ⬜ | free-shipping/holiday/festival/launch |
| Redirect Manager | ⬜ | 301/302, old→new URLs, 404 log |

## Adopted build order (dependency-driven)
1. **Admin UX + Dashboard/Activity** — cross-cutting (search/filter/CSV/expandable/bulk/saved-views) + business KPIs
2. **Settings** (site settings → DB) — CMS backbone
3. **Customer Management (CRM)**
4. **Reports** (business analytics)
5. **CMS core** (Pages + content model + **Media Library**)
6. **CMS managers** (Homepage Builder · Navigation · SEO · Email Templates · Announcement · Redirect)
7. **Enhance existing** (Fulfillment batch, Returns/Shipments fields, Product tabs, Rules triggers, Packaging cost-history, Warehouse cutoffs, Coupons advanced)
8. **Inventory WMS** (post-launch volume)

## Log (this Phase-2 program)
- ✅ **UI fix** — product-edit modal overflow (max-height + scroll)
- ✅ **P1 Dashboard** — business KPIs (today revenue/orders/AOV, top seller, low-stock, pending emails, failed payments) + inline activity timeline
- ✅ **Phase 1 Orders** — search, status/payment filters, CSV export, row badges (High-value/GST/Gift/COD/tags), internal note + tags + resend-email on detail
- ✅ **Phase 1 Activity** — filters (module/search/since), colour coding (severity), CSV export
- ✅ **Phase 1 Bulk** — batch fulfillment (create-shipments-for-all-ready, dispatch-all-assigned)
- ✅ **Phase 2 Settings** — general site settings → DB (brand/support/social/SEO/analytics/announcement), tax/legal shown read-only; GA reads its ID from settings
- ✅ **Phase 3 CRM** — Customer 360 (list + detail: LTV/AOV/orders/addresses/returns/loyalty/consent + notes/tags + derived segment)
- ✅ **Phase 4 Reports** — GST report (CGST/SGST/IGST by state + CSV, for filing), top products, coupon usage, repeat rate, orders-by-state
- ✅ **Phase 5 CMS (slice 1) Pages** — cms_pages content model + `/admin/content` editor + storefront reads DB→config fallback (policy/info pages editable, per-page SEO)

## 14 Refinements wave (post-CMS-slice-1, pre-slice-2)
The user reviewed the OS build and listed 14 refinements + 9 capabilities to weave in
"naturally, not bolted on later." Each done end-to-end (impl · UI · TS · live-verify · commit),
with a "why / is this the right approach" note. Guiding principle throughout: **derive from
the source of truth; flag gaps, never fake them.**

- ✅ **R5+R14** Feature flags + Maintenance mode + Store notice — live in the `site_settings`
  singleton (integrated, not a new table); maintenance scoped to the `(store)` layout so admin
  never locks out.
- ✅ **R1** Global admin search — one `globalSearch()` seam firing parallel ILIKE queries per
  resource; capability-aware (PII groups gated on `analytics.view`).
- ✅ **R8** System health dashboard — `getSystemHealth()` probes DB/payments/email/cron/webhooks/
  deliverability/queue; each check cheap + isolated (never throws).
- ✅ **R6** Notification center — `getAdminAlerts()` **derived** from live signals (no push table →
  always current), severity-ranked, deep-linked; nav badge via `getAlertCount()`.
- ✅ **R7+R3** Scheduled publish/unpublish + Revision history — `cms_pages` gains
  `publish_at`/`unpublish_at` + `scheduled` status; visibility computed at **read time**
  (`isPageLive`, no cron). Every save snapshots `cms_page_revisions`; restore = re-commit
  (non-destructive).
- ✅ **R10** Profit & loss — `variants.cost_price` (COGS) + editable `costs` settings group
  (packaging/courier/gateway %); GST shown as pass-through memo; zero-cost variants flagged so
  margin is never silently overstated.
- ✅ **R12** Fragrance performance — units/revenue/return-rate per family (return rate joins
  `return_items → variant → product`); unclassified kept, not dropped.
- ✅ **R11** Retention cohorts — by acquisition month, keyed by identity (user_id else email).
- ✅ **R13** CRM additions — favourite fragrance (derived), acquisition source (first-order UTMs),
  wishlist (existing table surfaced). **Last-viewed** stubbed with a note (needs storefront
  view-tracking → pairs with a future analytics beacon).
- ✅ **R2** Audit log — verified comprehensive (56 `logEvent` sites / 17 services); added
  actor-type filter + emphasised, colour-coded actor (accountability = *who*, not just *what*).
- 📝 **R4** Media usage tracking — **deferred to CMS slice 3 (Media Library)** by design: usage
  tracking only means something once assets live in a `media` table. Plan: a `media_usage`
  view/query resolving each asset → the pages/products/sections referencing it, blocking delete
  when in use. Noted here so the Media Library is built usage-aware from day one, not retrofitted.
- 📝 **R9** CMS phase reorder — **adopted** below (Pages → Media → Nav → Homepage → Email → SEO →
  Redirect). Media moves ahead of Nav because pages/homepage editors want an asset picker.
- 📝 **R15** Inventory/ERP — **deferral confirmed** (ERP-sized; must not gate launch). Stays Phase 8.

### Remaining CMS + later phases (R9 reorder adopted)
- **CMS slice 2** — **Media Library** (Supabase Storage: upload/crop/alt/folders/tags + **usage
  tracking R4** built in from the start)
- **CMS slice 3** — Navigation Manager (header/footer/mega-menu links → DB)
- **CMS slice 4** — Homepage Builder (section composition → DB, uses the Media picker)
- **CMS slice 5** — Email Template Manager (subject/blocks → DB)
- **CMS slice 6** — SEO Manager (per-page; mostly in `cms_pages.seo` already) · Redirect Manager
  (301/302 + 404 log)
- **Phase 6 Managers** — Blog/Journal, Collections editor, Homepage banners, Newsletter admin
- **Enhance existing** — Rules-engine execution (event→rules dispatcher, more actions), Product
  editor tabs, Returns/Shipments extra fields, Packaging cost-history + assembly + barcode,
  Warehouse cutoff/summary, Coupons advanced (analytics/segments/product-specific)
- **Phase 7 Optimization** — security (CSP), a11y (skip-link, focus), performance, more tests
- **Phase 8 Inventory/ERP** — deferred (per user, R15)
