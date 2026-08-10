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

### Stage R3 — Drill-downs + Customer Depth

*(Revenue After Refunds is NO LONGER here — moved to R1A.)*

- **Features:** registry-driven drills — Revenue / Operating Profit / Orders → `orders` (+ `range`),
  Customers → `customers`, Top product → `products`; Orders-by-state → `orders?state=…` **only if**
  `/admin/orders` supports a state filter (otherwise value-only — no fake destinations). Customer depth:
  revenue-per-customer; **Top customers via `customerAdminService`** (reuse). LTV deferred unless
  `customerAdminService` already exposes lifetime spend.
- **Components reused:** `KpiCard` / table rows as links.
- **Services reused:** `customerAdminService` (no duplication); no new refund work (done in R1A).
- **Registry reuse:** `resolveDrill` + `ANALYTICS_DRILL_TARGETS` (extend only for a genuinely real destination).
- **DB changes:** none expected.
- **Dependencies:** none.
- **Complexity:** Medium.
- **Testing:** drill resolution parity; top-customers reuse (no dup query).
- **Rollback:** flags.
- **Verification gate:** every drill lands on a real destination; no fabricated links.

### Stage R4 — UX Polish  *(final; was R6 — error boundary already moved to R1A)*

- **Features:** loading skeletons (`KpiCard`); tooltips; mobile table horizontal-scroll verification (the
  Analytics fix pattern); hover/focus consistency; empty-state consistency.
- **Components reused:** `KpiCard` states; `admin__table-wrap`.
- **Services reused:** none.
- **Registry reuse:** existing flags.
- **DB changes:** none. **Dependencies:** none. **Complexity:** Low.
- **Testing:** live local-Supabase authenticated QA (never hosted DB) + responsive check.
- **Rollback:** additive.
- **Verification gate:** polish only, zero redesign.

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
