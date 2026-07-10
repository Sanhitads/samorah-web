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

## Log
- **P1 Dashboard** — business KPIs + inline activity timeline · _in progress_
