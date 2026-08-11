# Samorah Reports — Refinement Roadmap

**Status: APPROVED (stage plan) — implementation not yet authorized. Awaiting explicit go-ahead to begin
Stage R1A.**

**Approved sequence:** R1A (Financial Correctness & Resilience) → R1B (Performance & Freshness) →
R2 (Executive Summary + Financial Health Banner + Report Status Banner) → R3 (Drill-downs) → R4 (UX Polish)
→ STOP. **No charts. No exports. No advanced reporting.**

Goal: polish `/admin/reports` into a **launch-ready financial reporting system** by reusing the shipped
Analytics Milestone 2 infrastructure. This is an **additive wiring** effort, not a redesign and not a new
capability layer. Reports stays **simpler than Analytics**.

## Governing philosophy (unchanged)
- **Correctness before presentation.** Financial numbers must reconcile before any UI work.
- **One canonical financial engine.** Every financial value on the page comes from a single calculation
  layer — no widget, KPI, table, banner, export, or chart computes its own numbers.
- **Reuse existing services wherever practical.** Where a current service already provides part of the
  financial logic correctly, **extend or reuse it** — never stand up a parallel implementation.
- Reports must stay **simpler than Analytics** — table-first, minimal charts.
- Reuse Analytics infrastructure wherever possible (`KpiCard`, registry, `resolveDrill`, `DataFreshness`,
  `SamorahChart`, `kpi.ts`, `cacheConfig`).
- **No duplicate services · no duplicate SQL · no duplicate business logic · no redesign · no unnecessary charts.**
- Preserve existing typography, spacing, layout, CSS architecture, RBAC (`analytics.view` / `data.export`),
  feature flags, and drill architecture. Everything additive and feature-flagged.

---

## Architectural cornerstone — the Single Financial Engine

The refinement effort is built on **one canonical financial calculation layer** (delivered in **Stage R1A**).
It is the sole source of every financial number Reports displays; the entire page is a presentation layer over
its output. This is an internal consolidation of the existing `reportsService` math into one authoritative
computation — **not a new service** — preserving the "no duplicate services / SQL / business logic" rule.
Where an existing service (e.g. `refundService`, Settings → Operating costs, per-variant cost) already
provides part of the logic correctly, the engine **extends or reuses it rather than introducing a parallel
implementation.**

### 1 · Single source of every financial value
The engine computes and returns, per selected window, a single canonical result carrying **all** of:
**Gross Sales · Discounts · Revenue After Refunds · GST · Shipping · Gateway Fees · Packaging · COGS ·
Operating Profit · Margin** (plus supporting counts and the integrity signals the banners consume).
Every KPI card, table row, banner — and any future export or chart — **consumes this output**; none performs
an independent calculation. No financial number may be re-derived at a presentation site.

### 2 · Frozen financial definitions (versioned)
The canonical formulas are documented **inside the calculation layer** and are **fixed** until
`REPORTS_CALC_VERSION` changes. Any future change to financial logic **must** bump the version. Canonical
definitions (v1):

```
Gross Sales      = Σ pre-discount goods value (ex-GST)
Discounts        = Σ discount_amount
Revenue          = Paid Revenue − Refunded Revenue          # "Revenue After Refunds" — the canonical revenue
Operating Profit = Revenue − COGS − Packaging − Shipping − Gateway Fees
Margin           = Operating Profit / Revenue               # 0 when Revenue = 0
GST              = Σ (CGST + SGST + IGST)                    # pass-through memo, never part of profit
```

Shipping (cost), Gateway Fees, and Packaging draw their rates from existing Settings → Operating costs;
COGS from per-variant cost. The engine reuses these existing inputs — it does not introduce new ones.

### 3 · Financial integrity (invariant) tests
The engine ships with invariant tests that fail on any accidental calculation regression, e.g.:
`Revenue == Gross Sales − Discounts − Refunds` · `Operating Profit == Revenue − (COGS + Packaging + Shipping
+ Gateway Fees)` · `Margin == Operating Profit / Revenue` (and `Margin == 0` when `Revenue == 0`) · GST is
never included in Operating Profit. These are the correctness backstop for the whole page.

---

## Stage sequence (revised)

Each stage ends with a full verification report + an explicit approval gate before the next — identical
discipline to Analytics M2.

### Stage R1A — Financial Correctness & Resilience  *(highest priority — no visual redesign, no performance work)*

The report's numbers must be **provably correct** before anything else is touched. R1A only changes
calculations and adds a failure-safe boundary; it does not restyle the report or add caching/RPCs.

R1A delivers the **Single Financial Engine** (see the Architectural Cornerstone above) — the one canonical
calculation layer every later stage consumes.

- **Features:**
  - **Build the canonical financial engine** — one authoritative computation (a consolidation of existing
    `reportsService` math, **not a new service**) returning, per window, all of: Gross Sales · Discounts ·
    Revenue After Refunds · GST · Shipping · Gateway Fees · Packaging · COGS · Operating Profit · Margin
    (+ counts + integrity signals). Every downstream KPI / table / banner consumes this output; **no
    presentation site re-derives a financial number.**
  - **Freeze + document the canonical formulas** inside the engine (the v1 definitions block above). These
    stay fixed until `REPORTS_CALC_VERSION` changes; any future financial-logic change **must** bump it.
  - **Verify (audit):** row-cap / unbounded-`.select()` undercount risk; GST aggregation; revenue
    aggregation; operating-profit calculation; refund handling.
  - **Fix — Revenue After Refunds** *(correctness requirement, not an enhancement):* subtract refunded
    amounts so revenue and operating profit **never knowingly overstate**. Refund-adjusted revenue is the
    canonical `Revenue` the whole page consumes.
  - **Add to the engine — Discount Totals + Gross Sales** (pre-discount): finalize the financial math before
    any summary is built on top of it.
  - **Establish the Calculation Version constant** (`REPORTS_CALC_VERSION = "v1"`) in the engine — a single
    config value stamping the current accounting logic. Defined here; displayed in R2's Report Status banner
    and available to stamp future historical exports. No business logic.
  - **Error boundary / resilient foundation (confirmed R1A — financial resilience, not UI polish):** if any
    aggregation fails, the report **degrades gracefully instead of blanking the page** — a scoped fallback
    renders in place of the failed section while the rest of the report stands. Fallback shows only on
    failure; the normal report is visually unchanged.
- **Components reused:** none new (calculation engine + a scoped error boundary).
- **Services reused:** `reportsService` (consolidated in place into the engine), `refundService` for refunded
  totals — **no duplicate refund logic**, no duplicate service.
- **Registry reuse:** none yet (R1A is pre-UI).
- **DB changes:** none preferred. A small refund-sum query may be added **only if** existing data can't be
  reconciled in-process; no new RPC unless a correctness fix genuinely requires it.
- **Dependencies:** none.
- **Complexity:** Medium.
- **Testing — financial integrity (invariant) suite:** the engine's invariants —
  `Revenue == Gross Sales − Discounts − Refunds`, `Operating Profit == Revenue − (COGS + Packaging +
  Shipping + Gateway Fees)`, `Margin == Operating Profit / Revenue` (and `== 0` when `Revenue == 0`), GST
  never in profit — plus GST/revenue/profit reconciliation on a fixture that **exceeds the row cap**, and
  full + partial refund-adjustment math. Purpose: detect accidental calculation regressions.
- **Rollback:** engine consolidation is behind the existing service surface; refund/discount/gross additions
  are additive and flag-guarded; boundary is inert on success.
- **Verification gate:** one canonical engine is the sole source of every financial value; invariant tests
  green; filing + P&L totals provably correct and refund-reconciled; formulas documented + version-frozen;
  report cannot crash wholesale; **no visual or performance change.**

### Stage R1B — Performance & Freshness  *(preserve R1A correctness exactly)*

- **Features:** wrap `reportsService` reads in `unstable_cache`; add freshness timestamps (`fetchedAtMs`);
  introduce an aggregation **RPC only if genuinely required** (e.g. the row-cap fix can't be done safely
  in-process).
- **Components reused:** none new.
- **Services reused:** `reportsService`; `cacheConfig` (`cacheMs`/`cacheSeconds`); `dataFreshness`.
- **Registry reuse:** `reportsService`-owned widget entries introduced here for flag/RBAC traceability.
- **DB changes:** RPC only if R1A's correctness fix demands it — otherwise none.
- **Dependencies:** none.
- **Complexity:** Low–Medium.
- **Testing:** cached output is **byte-identical** to R1A uncached output (no correctness drift); cache
  key/TTL; freshness timestamp surfaced.
- **Rollback:** flag off → uncached R1A path.
- **Verification gate:** identical numbers to R1A, now cached + timestamped.

### Stage R2 — Financial Integrity Banners + Executive Summary + Period Comparison

Presentation begins here, on top of a correct + cached foundation. Integrity is surfaced **before/with** the
summary. **Every KPI, banner field, and value in this stage consumes the R1A canonical engine output — no
component recomputes any financial number.**

- **Features:**
  - **Report Status banner** (always shown — provenance): report generated for selected period · generated-at
    timestamp · number of paid orders included · GST calculation basis · refund-adjustment status ·
    **data source / calculation basis** (e.g. _"Based on order snapshots."_) · **Calculation Version** (subtle
    identifier, e.g. _"Calculation Version: v1"_). Both new fields improve transparency and future-proof
    accounting logic / historical exports — **no new business logic**; the version comes from a single
    constant / config value.
  - **Financial Health banner** (shown **only when applicable** — data-quality warnings), **severity-aware**
    with three visual states — **Healthy · Warning · Attention Required** — expressed purely through the
    existing Samorah design language (no new component library, no redesign). Surfaces existing financial
    integrity conditions only: products missing cost prices · shipping cost not configured · gateway fees
    estimated · refund reconciliation incomplete · missing tax configuration. **No new business logic** —
    it reports existing system conditions and maps them to a severity.
  - **Executive Summary — intentionally minimal (5 KPIs only):** **Revenue** (refund-adjusted, per R1A),
    **Operating Profit**, **Margin**, **Orders**, **Customers**. **GST is NOT surfaced in the top strip.**
  - **Period comparison + trend arrows** on those KPIs via `KpiCard` + `compareKpi`.
  - **Financial KPI Provenance (architectural metadata — never displayed).** Every Executive Summary KPI's
    registry entry declares a `source` naming its canonical calculation origin, so any displayed number is
    always traceable to where it is computed. No presentation surface recomputes — all consume the R1A
    engine / service output. Canonical sources (v1):

    | KPI | `source` | Origin |
    |---|---|---|
    | Revenue | `financialEngine.revenue` | `ProfitReport.revenue` (engine, refund-adjusted) |
    | Operating Profit | `financialEngine.operatingProfit` | `ProfitReport.operatingProfit` |
    | Margin | `financialEngine.margin` | `ProfitReport.margin` |
    | Orders | `reportsService.orders` | `ProfitReport.orders` (paid-order count — a count, not a derivation) |
    | Customers | `reportsService.customers` | `getReports().customers.total` (buyer count) |

    Registry entry shape (metadata only — the code doesn't need `owner`/`source` at runtime; they answer
    "who maintains this?" and "where does this number come from?" for a future reader/auditor):
    ```
    {
      id: "reports.revenue",
      owner: "financialEngine",        // module responsible for maintaining the KPI (maintainability/audit)
      source: "financialEngine.revenue",
      drillTarget: "orders",
      permission: "analytics.view",    // reuse EXISTING reports RBAC — see note below
    }
    ```
    `owner` names the responsible module (`financialEngine` for Revenue/Profit/Margin, `reportsService` for
    Orders/Customers); `source` names the exact canonical field. Both are architectural metadata, never
    displayed.
    > **RBAC note:** the illustrative `permission: "reports.view"` is recorded here as the *existing*
    > `"analytics.view"` (the capability `/admin/reports` already gates on, + `"data.export"` for CSV).
    > Introducing a distinct `reports.view` capability would be an RBAC change and is **out of scope** for
    > R2 (rule: preserve RBAC). Flag for a separate decision if a dedicated capability is ever wanted.
- **Components reused:** `KpiCard`; `DataFreshnessBar`; existing banner/`cfg-hint` design classes for the two
  banners (no new visual language).
- **Services reused:** `businessOverviewService.getKpiSnapshot` (Orders previous-period for free);
  `reportsService` run for the previous window to supply Revenue/Profit/Margin/Customers previous-period —
  **reuse the same functions, no duplicate delta logic**.
- **Registry:** a **dedicated Reports registry / governance structure** is created here (per the agreed
  sequencing — governance lands *with* the widgets it governs, not before). Each entry mirrors the analytics
  registry philosophy (id / feature flag / permission / drillTarget) **plus** the `source` provenance field
  above. `kpi.ts` supplies all delta math. Analytics registry invariants are untouched.
- **DB changes:** none.
- **Dependencies:** none.
- **Complexity:** Low–Medium.
- **Testing:** Report Status banner shows all fields incl. data-source basis + Calculation Version; Financial
  Health banner maps conditions to the correct severity (Healthy / Warning / Attention Required) and hides
  when clean; 5-KPI strip contains no GST; deltas correct; no Analytics data duplicated; **every KPI's
  registry `source` resolves to a real field on the canonical engine/service output** (provenance test).
- **Rollback:** flags off → prior inline metric rows.
- **Verification gate:** minimal 5-KPI strip; Report Status banner (incl. data-source basis + Calculation
  Version); severity-aware Financial Health banner; correct deltas; GST absent from strip; **every Executive
  Summary KPI resolves from its documented canonical `source`, every KPI `owner` references a real module,
  and no presentation layer performs an independent financial calculation** (provenance verified).

> **Calculation Version** is defined as a single constant in the R1A calculation layer (e.g.
> `REPORTS_CALC_VERSION = "v1"`) and merely *displayed* here — so future accounting-logic changes bump one
> value that also stamps historical exports.

### Stage R3 — Drill-downs  *(pure navigation — no new calculations / SQL / services)*

*(Revenue After Refunds is NO LONGER here — moved to R1A. Customer depth — revenue-per-customer / top
customers / LTV — is DEFERRED post-launch: it would require new calculations/services, out of R3 scope.)*

- **Features:** registry-driven drills on the report's lower tiles/rows, **consistent with the Executive
  Summary routes** — Top products rows → `products`; Customers (Buyers) tile → `customers`; Orders-by-state
  rows → `orders?state=…` **only if** `/admin/orders` supports a state filter (otherwise value-only — no
  fake destinations). The Executive Summary KPI drills already ship (R2); R3 makes the rest of the page drill
  the same way. **No duplicate routing** (every destination via `resolveDrill`), no redesign.
- **Components reused:** `KpiCard` / existing table rows as `next/link`s (native middle/ctrl-click).
- **Services reused:** none. **No new calculations, no new SQL, no new services.**
- **Registry reuse:** `resolveDrill` + `ANALYTICS_DRILL_TARGETS` (extend the map ONLY for a genuinely real,
  new destination). Architectural consistency with Analytics preserved.
- **DB changes:** none. **Dependencies:** none. **Complexity:** Low.
- **Testing:** every drill target resolves through the registry; every route matches the Executive Summary;
  no broken links; keyboard navigation intact; middle-click and Ctrl/Cmd-click work.
- **Rollback:** additive (links only) — trivially removable.
- **Verification gate:** every drill lands on a real registry destination; no fabricated links; keyboard +
  middle/ctrl-click navigation intact.

#### Future Drill Candidates *(documentation only — NOT implemented; mirrors `REPORTS_NON_DRILLABLE` metadata)*

Every section intentionally left value-only today, and the capability that would unlock a real drill later:

| Section | Why value-only now | Capability that would unlock a drill |
|---|---|---|
| Orders by State | `/admin/orders` has no `ship_state` filter | Orders page **state filter** |
| Top Products | rows carry only a name, no id/slug | **Product-details routing** (per-product page) |
| GST | no transaction-level GST destination | **GST transaction view** |
| Fragrance | fragrance family is not an addressable page | **Fragrance analytics page** |
| Coupons | no per-coupon detail destination | **Coupon detail page** |
| Acquisition | no campaign-level destination | **Campaign reporting** |
| Retention | no cohort-drill destination | **Cohort explorer** |

These are captured in code as `REPORTS_NON_DRILLABLE` (architectural metadata: `isDrillable: false` + `reason`
+ `futureRequirement`; never rendered, no runtime effect). No fake destination is ever shipped in the interim.

#### Drill-target lifecycle & completeness *(governance — metadata + integrity test only)*

Every entry in the shared `ANALYTICS_DRILL_TARGETS` carries a lifecycle **status** (`DRILL_TARGET_STATUS`,
architectural metadata — never rendered, never affects routing):

- **active** — currently used by ≥1 widget (Analytics and/or Reports): `orders`, `ordersAwaiting`,
  `inventory`, `customers`, `products`.
- **reserved** — intentionally defined for a future capability, not yet wired to a widget (each carries a
  reason): `ordersCancelled`, `returns`, `shipments`, `fulfillment`, `reports`, `search`.
- **deprecated** — retained temporarily for backwards compatibility: _(none today)_.

A **registry-completeness test** guarantees every drill target is either **referenced by a widget** or
**explicitly reserved/deprecated** — so dead routes can never accumulate silently, and a newly-added target
must declare its lifecycle status (enforced at compile time by the `Record<DrillTargetKey, …>` type).

The navigation architecture (why it is registry-driven, shared between Reports and Analytics, resolved through
`resolveDrill`, lifecycle-governed, and protected by completeness + route-parity tests) is recorded in
**ADR 0006 — Registry-driven navigation** (`docs/adr/0006-registry-driven-navigation.md`).

### Stage R4 — UX Polish  *(final; was R6 — error boundary already moved to R1A)*

- **Features:** loading skeletons (`KpiCard`); tooltips; mobile table horizontal-scroll verification (the
  Analytics fix pattern); hover/focus consistency; empty-state consistency.
  - **[Functional-review finding · Resolved Later · Not Launch Blocking]** Add a **print stylesheet for
    Reports** (`@media print`): hide the admin sidebar / window pills / cookie banner, full-width content,
    `break-inside: avoid` on `.ash-metrics` / `.od-card` / tables — so a printed report is clean.
  - **[Functional-review finding · Resolved Later · Not Launch Blocking]** **Suppress (or neutralize) the
    Financial Health banner when there are zero paid orders** (`paidOrders === 0`) — config warnings read as
    noise on an empty report.
- **Components reused:** `KpiCard` states; `admin__table-wrap`.
- **Services reused:** none.
- **Registry reuse:** existing flags.
- **DB changes:** none. **Dependencies:** none. **Complexity:** Low.
- **Testing:** live local-Supabase authenticated QA (never hosted DB) + responsive check; **print-preview
  check**; zero-orders empty-state check.
- **Rollback:** additive.
- **Verification gate:** polish only, zero redesign.

> **Stage R4 introduced zero business logic changes. All financial calculations remain identical to Stage R3.**
> Verified by diff: `financialEngine`, `financialHealth`, `reportsRegistry`, `analyticsRegistry`,
> `reportsService`, the GST CSV route, and the banner components have **zero** changes in R4; only tooltip
> `title` attributes, a render-gate for the health banner at zero orders, a print-only `@media` block, and a
> route loading skeleton were added. Every displayed `value` is byte-identical to R3.

#### Definition of Done — Visual Regression Checklist *(every R4 change must satisfy all)*

- [ ] **No layout regressions** — element positions/structure unchanged unless intentionally updated.
- [ ] **No spacing regressions** — margins/padding/gaps preserved.
- [ ] **No typography regressions** — fonts/sizes/weights/letter-spacing preserved.
- [ ] **Responsive verification** — **desktop · tablet · mobile** all correct, no horizontal overflow.
- [ ] **Keyboard navigation preserved** — all interactive elements reachable/operable via keyboard.
- [ ] **Focus-visible states preserved** — visible focus ring on every focusable element.
- [ ] **Existing accessibility labels preserved** — `aria-label` / roles / `title` unchanged or improved.
- [ ] **Empty states remain truthful** — zero-data messaging still accurate (no fabricated content).
- [ ] **Skeleton loading does not change layout height** — skeletons occupy the same box as loaded content (no jump).
- [ ] **Tooltips never cover critical content** — tooltips are supplementary; they never obscure values/actions.
- [ ] **Browser print preview verified** — printed report is clean and readable.
- [ ] **No CLS / layout shift introduced** — no cumulative layout shift from skeletons/tooltips/print styles.
- [ ] **Existing screenshots remain valid** unless a change is an *intentional* visual update (then re-capture).

#### Accessibility Verification *(verify only — do NOT redesign accessibility)*

Confirm, without changing the accessibility model:

- [ ] **Keyboard navigation** works across the whole page.
- [ ] **Focus order** is logical (matches visual/reading order).
- [ ] **Screen-reader labels** present and meaningful (KPI cards, banners, tables, drill links).
- [ ] **Print stylesheet readability** — content legible and well-ordered in print.
- [ ] **Severity indicators are not colour-only** — the Financial Health banner already pairs colour with a
      text label ("Financial integrity · Warning/Attention required/Healthy") and an icon; verify this holds
      for every state so severity is perceivable without colour.

#### Screenshot Baseline Verification *(manual before/after — no new tooling)*

For each R4 change, capture **before** and **after** screenshots at **desktop · tablet · mobile** and compare
manually. **Only intentional visual differences may exist** — the purpose is to catch accidental **spacing,
alignment, or typography** regressions. (Reuses the existing local-Supabase Playwright screenshot harness; no
new dependency or visual-diff tool is introduced.)

- [ ] Desktop before/after captured and compared.
- [ ] Tablet before/after captured and compared.
- [ ] Mobile before/after captured and compared.
- [ ] Every diff is an *intentional* change; no accidental spacing/alignment/typography drift.

#### Print Verification Checklist *(verification only — no redesign)*

With the R4 print stylesheet applied, verify the browser print preview:

- [ ] **No clipped content** — nothing cut off at page edges.
- [ ] **No overlapping elements** — no element prints over another (e.g. cookie banner / sidebar removed).
- [ ] **KPI cards do not split awkwardly** across a page break.
- [ ] **Tables paginate naturally** — rows break cleanly between pages.
- [ ] **Important headers remain visible where possible** (section titles not orphaned from their content).
- [ ] **Readable in grayscale** — severity/emphasis survive a black-and-white print (not colour-dependent).

### Milestone — Founder Finance Sign-off  *(after R4 — business approval, not just technical completion)*

Since Reports now drives business decisions, the module is not "done" until it is **business-approved**, not
only technically complete. **Owner: Founder.** Each item confirmed against the books for a real period.

**Founder Finance Sign-off Checklist**

- [ ] Revenue verified
- [ ] GST verified
- [ ] Refund calculations verified
- [ ] Operating Profit verified
- [ ] Margin verified
- [ ] Executive Summary verified
- [ ] Report Status Banner verified
- [ ] Financial Health Banner verified
- [ ] GST CSV export verified
- [ ] Empty database behaviour verified
- [ ] Mobile layout verified
- [ ] Print output verified
- [ ] Drill-downs verified
- [ ] Production sample order verified
- [ ] Founder approval received

- **Status:** _Pending_ → **Approved** (recorded here once the checklist is complete).

---

## Release Freeze  *(effective on Founder Finance Sign-off)*

- **The Reports module is feature complete.**
- **Only production bug fixes may be accepted** after sign-off.
- **Any future feature work requires explicit roadmap approval** (a new, approved stage) — no ad-hoc additions.

---

## Launch Dependencies  *(assumptions required for Reports correctness)*

Reports is a **reporting layer** — it **reads and reflects** the systems below to produce correct figures.
It **consumes these systems; it does not replace them.** If an upstream input is wrong or unconfigured, the
report faithfully reflects that (and the Financial Health banner flags the known cases).

| Dependency | What Reports relies on | If missing/incorrect |
|---|---|---|
| **Orders** | paid `orders` rows (`taxable_amount`, `subtotal`, `discount_amount`, `shipping_amount`, `total_amount`, `placed_at`) | undercount/incorrect revenue — Reports reflects the order data as-is |
| **Refunds** | `orders.refund_amount` (settled refunds) | revenue not refund-adjusted if refunds aren't recorded |
| **Product Costs** | per-variant `cost_price` | COGS/profit optimistic — flagged via `variantsMissingCost` (Attention) |
| **Shipping Costs** | Settings → Operating costs `shippingCostPerOrder` | courier expense excluded — flagged (Warning) |
| **Gateway Fees** | Settings → Operating costs `paymentFeePercent` | estimated, not reconciled — flagged (info) |
| **GST configuration** | per-order CGST/SGST/IGST tax snapshots | GST filing figures depend entirely on correct order-time tax config |

Reports does not compute tax, take payments, issue refunds, or set costs — those live in their own systems;
Reports only aggregates their outputs under the frozen `REPORTS_CALC_VERSION` logic.

---

## Milestone — Production Verification  *(after Founder Finance Sign-off — post-deployment)*

After deployment, verify against **one real production order** and **one real production refund** that the
report matches reality end-to-end. Confirm each of these equals the production values:

- [ ] Revenue matches production
- [ ] Operating Profit matches production
- [ ] GST matches production
- [ ] Margin matches production
- [ ] Executive Summary matches production
- [ ] CSV export matches production

- **Status:** _Pending_ → **Verified** (recorded here once a real order + real refund reconcile in production).

---

## Report Version History  *(permanent maintenance history — branch `replatform/nextjs`)*

| Stage | Purpose | Commit |
|---|---|---|
| **R1A** | Canonical Financial Engine — refund-adjusted revenue, row-safe aggregation, frozen v1 formulas, resilience | `a1b33ea` |
| **R1B** | Performance & freshness — `unstable_cache` readers + freshness stamps | `da9b557` |
| **R2** | Executive Summary + Report Status & Financial Health banners (registry provenance) | `5d6f26b` |
| *(docs)* | Report Status banner documented as a Financial Snapshot | `7c844f9` |
| **R3** | Registry-driven drill-downs + navigation governance (lifecycle, completeness, ADR 0006) | `75fa9ef` |
| **R4** | UX polish — print stylesheet, loading skeleton, tooltips, empty-state health suppression | `2ba6934` |
| *(docs)* | Finance sign-off checklist · release freeze · launch dependencies · production verification | `826a5e7` |

---

## Known Launch Limitations  *(deliberate scope boundaries — NOT missing functionality)*

These are intentional roadmap decisions to keep Reports **elegant, minimal, operational, founder-focused** —
each was consciously excluded, not overlooked:

- **No scheduled / emailed reports** — reports are viewed on demand.
- **No PDF export** — deferred to the shared Analytics export framework (post-launch).
- **No Excel export** — same; the existing **GST CSV** covers launch filing.
- **No charts** — Reports is table-first by design (charts live in Analytics).
- **No forecasting** — Reports reflects history, it does not project.
- **No budget planning** — out of scope; Reports is a reporting layer, not a planning tool.
- **No AI insights / narrative summaries** — not part of the founder-focused scope.
- **No historical calculation-version switching** — a report is produced under the current
  `REPORTS_CALC_VERSION`; there is no UI to re-run past periods under a different version (the version is
  *stamped* for traceability, not *switchable*).

Any of these becoming in-scope requires an explicit, approved new stage (see **Release Freeze**).

---

## Maintenance Rules  *(binding for all future changes)*

- **Never duplicate financial calculations.** There is exactly one place money is computed.
- **All financial values must come from the canonical Financial Engine** (`lib/reports/financialEngine`).
- **UI components must never calculate money** — they format and display engine output only.
- **Accounting-logic changes require a `REPORTS_CALC_VERSION` increment** (which also re-stamps exports).
- **Financial-formula changes require invariant tests** (extend `financialEngine.test.ts`) proving the new
  relationships hold.
- **ADRs and the roadmap must stay synchronized** — a navigation/architecture change updates ADR 0006 and
  this file together.
- **Reports remains simpler than Analytics by design** — table-first, minimal charts, no scope creep.

---

## Platform Backlog  *(surfaced during the Reports functional review — not Reports-scoped)*

- **[Resolved Later · Not Launch Blocking]** Hide the storefront `CookieConsent` on `/admin/*` routes — it
  currently overlays admin pages (pre-existing; observed overlapping the Reports content during QA).

---

## Recommended implementation order
**R1A → R1B → R2 → R3 → R4.** Correctness first, then performance, then the minimal summary + integrity
banners, then drills/customer depth, then polish.

## Deferred to post-launch
- **Revenue Composition donut** — deferred; only reconsidered if it can be added with **almost no** extra
  complexity. Reports stays table-first pre-launch.
- **Additional CSV exports (P&L, Top Products)** — deferred. The existing GST CSV is sufficient for launch;
  a unified export framework ships later **alongside the Analytics export architecture** (Stage 6:
  Print / Excel `exceljs` / PDF `@react-pdf/renderer`).
- Per-product profit / margin / return %; fragrance-family margin; profit-trend / revenue-vs-profit daily
  chart (needs new daily-COGS SQL); HSN-level GST summary; LTV (if not already provided).

## Risks
1. **Row-cap undercount (Critical, financial).** Verified + fixed in **R1A** — filing/P&L numbers cannot be
   approximate.
2. **Refund overstatement (High).** Now a **correctness requirement in R1A**, not a later enhancement.
3. **Scope creep (Medium).** Held back by deferring charts, extra exports, and per-product depth.
4. **Drill honesty (Low).** State drill gated on a real `/admin/orders` state filter.

## Dependencies
**None new for launch.** All primitives already shipped (`KpiCard`, `resolveDrill`, `DataFreshnessBar`,
`cacheConfig`, `kpi.ts`, `refundService`, `customerAdminService`). `exceljs` / `@react-pdf/renderer` are
post-launch only, via the shared Analytics export engine.

## Before launch
R1A · R1B · R2 · R3 · R4, plus: verify PostgREST row limit and the `/admin/orders` state filter.

## After launch
Revenue Composition donut · P&L/Top-products CSV (unified with Analytics Stage 6) · per-product depth ·
fragrance margin · profit-trend chart · HSN GST summary · LTV.

---

## Financial Snapshot — the Report Status banner  *(architectural note; documentation only)*

The **Report Status banner** (Stage R2) is, semantically, a **Financial Snapshot**: it records the financial
state of the selected reporting window at the moment the report was generated. It captures:

- **Selected reporting period** — the active window (30 / 90 / 365 days / all time).
- **Generated timestamp** — when the underlying snapshot was (re)computed (`freshness.fetchedAtMs`).
- **Order Snapshot data source** — first-party `orders` rows; no external provider.
- **`REPORTS_CALC_VERSION`** — the frozen canonical accounting logic the figures were produced under.
- **Financial state at time of generation** — paid orders included · GST basis · refund-adjustment status.

> **Financial Snapshot** = the financial state of the selected reporting window, produced under
> `REPORTS_CALC_VERSION` from **Order Snapshots**, as of **Generated At**.

This is why the banner also exposes the non-visual `data-report-generated-from` = "Order Snapshots →
Financial Engine v1": a snapshot should always be traceable to the data source + calculation version that
produced it. When historical exports arrive (post-launch), each export is stamped with the same
`REPORTS_CALC_VERSION`, so a saved report is a reproducible snapshot — future developers reading a stored
figure know exactly which accounting logic produced it.

---

## Financial Glossary  *(documentation only — must match the frozen v1 formulas governed by `REPORTS_CALC_VERSION`)*

Every term below is computed **once** by the canonical financial engine (Stage R1A); the page only displays
these values. Definitions are fixed until `REPORTS_CALC_VERSION` increments.

| Term | Definition | Notes |
|---|---|---|
| **Gross Sales** | Σ pre-discount goods value (ex-GST) across paid orders in the window. | The top line *before* any discount. Reconciles as `Gross Sales − Discounts = goods revenue (ex-GST, post-discount)`. |
| **Discounts** | Σ `discount_amount` across paid orders in the window. | Coupon + promotional reductions applied before tax. |
| **Revenue** *(Revenue After Refunds)* | `Net Revenue − Refunds`, where Net Revenue = Σ `taxable_amount` (ex-GST, incl. shipping ex-GST). | The **canonical revenue** the whole page consumes. **Conservative v1 refund model:** the *entire* `refund_amount` is subtracted even though it is GST-inclusive while Net Revenue is ex-GST — so Revenue may be slightly **understated** by the GST share of refunds. Intentional: a financial report must never overstate. A future `REPORTS_CALC_VERSION` may apportion the ex-GST refund share precisely (→ version bump). |
| **Refunds** | Σ refunded amounts for orders in the window (from `refundService` / refund records). | Reversal of previously-collected revenue; sourced from existing refund data, not recomputed. |
| **GST** | `Σ (CGST + SGST + IGST)` across paid orders in the window. | **Pass-through memo** — collected and remitted; **never part of Operating Profit**. |
| **Shipping** | Courier cost = orders × `shippingCostPerOrder` (Settings → Operating costs). | What *we pay couriers* (an expense). Distinct from shipping *collected* from customers (income). |
| **Gateway Fees** | `grossCollected × paymentFeePercent%` (Settings → Operating costs). | Payment-gateway processing cost. |
| **Packaging** | orders × `packagingPerOrder` (Settings → Operating costs). | Per-order packaging expense. |
| **COGS** | Σ (per-variant `cost_price` × quantity) for sold variants. | Variants sold with no cost set are counted (`variantsMissingCost`) so profit is flagged optimistic, never silently overstated. |
| **Operating Profit** | `Revenue − COGS − Packaging − Shipping − Gateway Fees`. | Excludes GST (pass-through). Uses refund-adjusted Revenue. |
| **Margin** | `Operating Profit / Revenue`. | Expressed as %. Defined as **0 when Revenue = 0** (no division-by-zero). |

> Changing any definition above is an **intentional accounting-logic change** and **requires a
> `REPORTS_CALC_VERSION` increment**, which also re-stamps historical exports.
