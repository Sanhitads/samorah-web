# Samorah Admin Settings — Refinement Roadmap

**Status: SETTINGS MODULE COMPLETE FOR LAUNCH — S1A + S1B + S2A + S2B APPROVED, COMMITTED & FROZEN.** No
further Settings work is planned; future changes require explicit roadmap approval (governance/registry
changes also require an `INTEGRATION_REGISTRY_VERSION` increment).

Goal: make `/admin/settings` **launch-ready** by adding operational visibility (integration status/health) and
usability (validation, save feedback, unsaved-guard, audit) — **reusing existing services**, additive only, no
redesign. Sequenced correctness/visibility → usability → optional enhancements.

**Approved phasing:** S1A (Integration Status & Operational Health) → S1B (Editable Settings Improvements) →
S2 (Operational Enhancements). A verification report + approval gate after **each** phase.

## Settings Module Status
| Phase | Status | Commit |
|---|---|---|
| **S1A — Integration Status & Operational Health** | **Approved · Frozen** | `7caefe7` (tag `settings-s1a-baseline`) |
| **S1B — Editable Settings Improvements** | **Approved · Frozen** | `bee6fc5` |
| **S2A — Dispatch Configuration (cutoff + SLA)** | **Approved · Frozen** | (tag `settings-s2a-baseline`) |
| **S2B — Read-only Razorpay Connection Test** | **Approved · Frozen** | (tag `settings-s2b-baseline`) |

**The Settings module is COMPLETE FOR LAUNCH.** *(Deferred / out of scope: business-address editing, email
test-send, free-shipping-threshold editing — each requires a new approved phase.)*

## Launch Scope Boundary *(governance — documentation only)*
- **S1A and S1B constitute the approved launch scope** for the Settings module.
- **S2 consists of operational enhancements, not launch blockers** — the module can launch without S2.
- **Future structural changes require explicit roadmap approval** (governance/registry changes also require an
  `INTEGRATION_REGISTRY_VERSION` increment).
- **Post-launch enhancements remain roadmap-controlled** — no ad-hoc additions; each requires an approved phase.

## Settings Module Dependencies *(reference — documentation only)*

**Module OWNS**
- Site settings (the `site_settings` singleton via `siteSettingsService`)
- Operating-cost configuration (`site_settings.costs`)
- Business configuration (brand / support / social / SEO / announcement, etc.)
- Integration Status **presentation** (the read-only panels + registry + aggregator)

**Module CONSUMES** *(reads existing outputs — never owns their truth)*
- `healthService` (Payments / Webhooks / Email / deliverability)
- `auditService` (Updated By · At · Changed Groups)
- `analyticsConfig` (GA4 / GTM / Clarity / Meta flags)
- Notification services (`opsEngine.getChannelHealth`, the existing test endpoint)
- Payment health (`RAZORPAY`, `webhook_logs`, `razorpaySettlementService`)
- Email provider (`emailConfigured` / `emailFrom` / `emailReplyTo` / delivery health)
- Environment variables (integration config + `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`)

**Module does NOT OWN** *(these live in their own systems; Settings only reflects them)*
- Payment processing
- Checkout calculations
- Shipping calculations
- Analytics
- Notification delivery

## Operational Verification *(performed AFTER production deployment)*

A post-deployment smoke check against production:
- [ ] **Settings save** — an edit saves and persists (reload reads it back)
- [ ] **Audit summary** — Updated By · At · Changed Groups reflects the save
- [ ] **Integration Status** — panels show correct severities + diagnostics + provenance
- [ ] **Notification Test** — the test action fires and shows per-channel results
- [ ] **Launch Readiness** — reflects the live integration health
- [ ] **Environment display** — shows the correct environment (+ build metadata if present)

- **Status:** _Pending_ → **Verified** (recorded here once confirmed in production).

## Governance philosophy — shares the ADR-0006 model
The Integration Registry follows the **same governance philosophy as ADR 0006 — Registry-driven Navigation**
(`docs/adr/0006-registry-driven-navigation.md`): **single source of truth · registry-driven composition ·
compile-time governance · structural integrity tests · centralized ownership.** The **domains differ**
(navigation destinations vs. operational integrations), but the **governance model is intentionally shared** —
one consistent, registry-driven, test-enforced pattern across the admin.

---

## Phase S1A — FROZEN (Settings module baseline)

Phase S1A is **complete, verified, and frozen** — the baseline for the Settings module.

### Integration Registry Freeze *(mirrors the `REPORTS_CALC_VERSION` governance)*
- **`INTEGRATION_REGISTRY_VERSION` is frozen at `v1`.**
- **Structural registry changes require a version increment** (like `REPORTS_CALC_VERSION` for accounting logic).
- **Stable integration IDs must never be renamed** — an integration may only be *deprecated*, never re-identified.
- **Diagnostic codes remain frozen** — recommended actions reference codes, not free text; wording may change,
  codes may not (they are the future audit/export/monitoring keys).

### Architecture Freeze *(S1A)*
The following are now **frozen**; future architectural changes require **explicit roadmap approval**:
- Integration Registry
- Aggregator Contract
- Registry Authority
- Severity Mapping
- Recommended Action Registry
- Timestamp Provenance
- Registry Integrity Tests

### Operational Guarantees *(verified in S1A)*
- **No integration blocks Settings.**
- **Unknown is always handled gracefully** (neutral operational state, never an error).
- **The Registry remains the only authority** (rendered panels == registry, enforced by the authority test).
- **No duplicate health logic exists** (the aggregator only composes existing service outputs).
- **Aggregation is concurrent** (single `Promise.allSettled` fan-out ≈ slowest source, not the sum).
- **Timeout behaviour is bounded** (per-source time bound; invalid/missing config → documented default).
- **Health never blocks editing** (integration status is informational, fails closed).
- **Registry integrity prevents drift** (structural + authority tests fail on any bypass or half-declaration).

---

## Phase S1B — FROZEN (Editable Settings Improvements)

Phase S1B is **complete, verified, and frozen**. The following are now **frozen**; future structural changes
require **explicit roadmap approval**:
- **Validation contract** — the operating-cost rules (packaging ≥ 0, courier ≥ 0, gateway 0–100; NaN/blank
  invalid) and their **corrective** messages (`lib/settings/costValidation.ts`).
- **Client validation** — blocks save on error, per-field `ff-err` + `aria-invalid`, in `SiteSettingsForm`.
- **Server validation** — the site route re-checks `patch.costs`, returns **422** with `fieldErrors`
  (defense-in-depth; mirrors the client rules).
- **Unsaved-changes guard** — reuses `shouldGuardNavigation` + `beforeunload` with a baseline-snapshot dirty
  authority and an "Unsaved changes" indicator.
- **Save feedback** — clear success/error (`role="alert"` on error), no false "Saved" on failure, retry-safe.
- **Audit summary** — Updated By · At · Changed Groups via `auditService.getRecentAuditEvents({ entityType:
  "settings" })`. **No new tracking/services.** ("Changed Groups" reflects the full submitted payload — correct
  behaviour; a diff-only PATCH is a possible future optimisation, not a fix.)

## Phase S1B — Acceptance

- **Owner:** Founder.
- **Status:** **Approved and Frozen.**

**Acceptance checklist**
- [x] Validation verified
- [x] Server validation verified
- [x] Persistence verified (packaging/courier/gateway change → save → reload → read back; DB-confirmed)
- [x] Save failure verified (graceful, no false "Saved", error shown, indicator remains, retry succeeds)
- [x] Unsaved-changes verified (indicator + nav confirm; dismiss stays, accept leaves)
- [x] Audit summary verified (Updated By · At · Changed Groups)
- [x] Accessibility verified (`aria-invalid`, `role="alert"`, `aria-live`)
- [x] Browser verification completed (authenticated, local Supabase)
- [x] Tests passing
- [x] Build passing

---

## Dispatch Configuration — S2A *(persisted · validated · audited; not yet consumed)*

### Cutoff Time — timezone interpretation *(documentation only)*
The configured **Cutoff Time** (`site_settings.dispatch.cutoffTime`, 24-hour `HH:MM`) is interpreted in the
**store's operating timezone** (the registered business timezone, IST) — a wall-clock time, **not UTC**. No
timezone conversion is implemented in S2A; this documents the intended operational interpretation.

### Dispatch SLA — canonical definition *(FROZEN)*
**Dispatch SLA** (`site_settings.dispatch.slaHours`) represents **elapsed clock hours**, measured **from
successful order placement**, **until expected dispatch**. This definition is **frozen** — any change requires
explicit roadmap approval.

### Configuration status
Dispatch configuration is currently **persisted · validated · audited**, but **NOT yet consumed by any
production workflow**. **Future shipping features must reuse this configuration** (`site_settings.dispatch`)
rather than introducing duplicate dispatch/cutoff settings.

### Operational ownership
- **Intended operational owner:** **Fulfillment Operations.**
- **Expected future consumers:** Operations dashboard · Dispatch planning · Shipping communications.

> **Dispatch configuration is OPERATIONAL METADATA ONLY.** It does **not** influence checkout, payment,
> shipping calculations, or customer promises until a future **approved shipping project** consumes it.

---

## Phase S2A — FROZEN (Dispatch Configuration)

Phase S2A is **complete, verified, and frozen**. The following are now **frozen**; future structural changes
require **explicit roadmap approval**:
- **Dispatch validation contract** — cutoff = 24-hour `HH:MM`; SLA = whole hours 0–240; corrective messages
  (`lib/settings/dispatchValidation.ts`), client + server (route 422). Same pattern as the S1B cost validator.
- **Dispatch configuration contract** — `site_settings.dispatch = { cutoffTime: string; slaHours: number }`,
  persisted via `siteSettingsService`.
- **Timezone interpretation** — store operating timezone (IST) wall-clock, **not UTC**.
- **SLA definition** — elapsed clock hours, from successful order placement, until expected dispatch.
- **Operational ownership** — Fulfillment Operations.

## Phase S2A — Acceptance

- **Owner:** Founder.
- **Status:** **Approved and Frozen.**

**Acceptance checklist**
- [x] Validation
- [x] Persistence
- [x] Reload
- [x] Audit
- [x] Accessibility
- [x] Boundary values (00:00 · 23:59 · SLA 0 · SLA 240)
- [x] Tests
- [x] Build

---

## Phase S2B — FROZEN (Read-only Razorpay Connection Test)

Phase S2B is **complete, verified, and frozen**. It adds a **read-only** Razorpay "Test connection" action
(reusing `razorpaySettlementService` + the frozen S1A integration model). Business address and email test-send
are **not** part of this increment (deferred).

### Provider Test Contract v1 *(FROZEN)*
Every provider connection test:
- **is read-only**
- **never creates external records**
- **never mutates provider state**
- **never creates payments**
- **never creates shipments**
- **never sends emails**
- **never sends SMS**
- **never dispatches notifications**
- **never replaces end-to-end production verification**

**Future provider tests must conform to this contract.** Changing it requires explicit roadmap approval.

### Verification scope
A successful Razorpay connection test verifies **only**:
- API connectivity
- authentication
- authorization
- provider availability

It does **NOT** verify:
- checkout
- payment capture
- webhook processing
- refunds
- settlement lifecycle
- signature verification
- production payment flow

(This prevents future misunderstanding — the test is an operational diagnostic, not a transaction-flow check.)

### Ownership
- **Owner:** Commerce Infrastructure.
- **Purpose:** Operational diagnostics — **not** transaction verification.

### Known limitation
`getSettlementSummary` is `unstable_cache`-wrapped (1 h); the test reflects the most recent settlements read
within the TTL (the cold-cache first call is fresh). A truly-live per-click re-check would require bypassing
the cache, deliberately avoided to prevent a parallel Razorpay call.

## Phase S2B — Acceptance
- **Owner:** Founder.
- **Status:** **Approved and Frozen.**
- **Checklist:** Read-only contract ✔ · 5-state UI (Connected / Auth failed / Config missing / Provider
  unavailable / Timeout) ✔ · reuse of frozen integration model ✔ · no editable keys ✔ · Tests ✔ · Build ✔ ·
  Live QA ✔.

## The architectural insight (drives the whole plan)
Analytics, Payment, Email, and Notification integrations are **environment-managed** — their runtime reads
`process.env` (`analyticsConfig`, `RAZORPAY`, the email lib, `opsEngine`), **not** `site_settings`. Therefore
they are surfaced as **read-only STATUS panels**, never editable fields (editing env-managed values here would
create a duplicate/dead config source). This matches the page's own precedent (Tax & legal is read-only,
code-managed). Only genuinely `site_settings` / `shipping_settings`-backed fields are editable.

> The existing editable "GA4 Measurement ID" input writes to `site_settings.analytics.gaId`, but
> `AnalyticsProvider` injects GA4 from **env** — so that field is **dead today** (edits don't take effect).
> S1A replaces it with the read-only analytics status so the page never shows misleading editable env values.

## Governing rules (all phases)
- **No duplicate configuration sources · no duplicate services · no duplicate health logic.**
- **Reuse** existing health (`healthService.getSystemHealth`), notifications (`opsEngine.getChannelHealth`,
  `channelStatus`, the existing test route), email (`emailConfigured`/`emailFrom`/`emailReplyTo`/
  `getEmailProvider`/`getEmailDeliveryHealth`), analytics (`analyticsConfig`), payment (`RAZORPAY`,
  `webhook_logs`, `razorpaySettlementService`), and audit (`auditService.getRecentAuditEvents`).
- **Integration health is informational — it must NEVER block editing or saving unrelated Settings.**
- Env-managed sections are clearly labelled **"Managed by Environment Variables"** (read-only).
- Preserve the current design language (`cfg-section` / `cfg-readonly` / `om-pay` / `an-fresh` classes). **No
  redesign.** All additive.

---

## Integration Registry & Status Aggregator — governance

### Integration Registry *(single source of truth — no hardcoded panels)*
A single **Integration Registry** declares every supported integration; **the aggregator renders panels ONLY
by iterating this registry** — no panel is hardcoded, **no direct panel implementations are permitted**. Each
entry declares (all by string key / reference to an **existing** source — the registry owns no health of its
own):

| Field | Meaning |
|---|---|
| `id` | **permanent** stable identifier (`analytics`, `payment`, `email`, `notifications`) — see stability rule |
| `provider` | display name (GA4/GTM/Clarity · Razorpay · Resend · Slack/SMS/WhatsApp…) |
| `owningModule` | the owning **module** (informational): Commerce · Analytics · Notifications · Email · Payment |
| `healthSource` | which existing service call yields its status (`getSystemHealth` item / `getChannelHealth`…) |
| `diagnosticsSource` | where the diagnostic **code** comes from (mapped from the service's status/`detail`) |
| `provenanceSource` | configuration origin (`analyticsConfig` / `commerce.ts` / `emailProvider` / notifications config) |
| `timestampSource` | origin of any "last successful communication" time (`webhook_logs` / `notification_logs` / settlement service / email delivery service) — **exposed, never computed** |
| `auditSource` | audit trail when applicable (`auditService`) — else `null` |

Adding an integration = **one registry entry** pointing at existing sources.

- **Extension rule (binding):** **every** future integration **MUST register through the Integration Registry**
  — direct/independent panel implementations are **not allowed**. The registry is the single architectural
  entry point for all integration visibility (enforced by the authority test).
- **`INTEGRATION_REGISTRY_VERSION = "v1"`** — a version identifier for the registry's structure. **Any future
  structural change to the registry (fields, contract) requires a version increment.**
- **Stable IDs (binding):** integration `id`s are **permanent — never renamed**. An integration may only be
  **deprecated** (marked, retained), never re-identified. IDs are the durable key everything else references.
- **Owning module** is informational only (grouping/ownership), never affects rendering or health.
- **Timestamp provenance:** each displayed "last successful communication" time carries its **source**
  (`timestampSource`); panels **expose** provenance, they never compute a timestamp.

#### Integration Registry — version history
| Version | Includes | Structural change |
|---|---|---|
| **v1** | Analytics · Payments · Notifications · Email | Initial registry (fields: id · provider · owningModule · healthSource · diagnosticsSource · provenanceSource · timestampSource · auditSource). |

Future registry versions must **briefly document the structural addition or removal** here and bump
`INTEGRATION_REGISTRY_VERSION`.

### Registry integrity & authority tests
- **Structural completeness:** every registered integration declares `healthSource`, diagnostics, provenance,
  `owningModule`, `timestampSource` (or `null`), **and** has a matching **recommended-action mapping**. A
  newly-added integration missing any of these fails the test (analogous to the Reports registry-completeness
  test) — no integration ships half-declared.
- **Registry authority (single source of truth):** the aggregator's rendered panel set must equal the
  registry entries **exactly** — so **removing an entry removes its panel, and any panel not backed by a
  registry entry (a bypass / hardcoded panel) fails the structural tests.** The registry stays the sole
  source of truth for which integrations exist.

### Aggregator contract *(binding)*
The **Integration Status Aggregator** is a pure **presentation-composition layer** over the registry. It:
- **only composes existing service outputs** (`healthService.getSystemHealth`, `opsEngine.getChannelHealth`,
  `analyticsConfig`, `RAZORPAY`, `webhook_logs`, `razorpaySettlementService`, `auditService`);
- **never computes health** — it maps statuses the services already return;
- **never derives business state**; **never replaces service ownership** (each service stays the sole authority);
- **never caches a health copy** — it re-queries on each render (see *Future refresh*);
- **executes integration lookups CONCURRENTLY** (a single `Promise.allSettled` fan-out) — **sequential
  execution is not permitted**; one slow integration must not delay the others.

### Standardized severity model *(all panels)*
One common model — **Healthy · Warning · Critical**, plus a neutral **Unknown** fallback — each carrying an
**icon + label + diagnostic reason**, reusing the **Reports Financial Health banner** visual language
(`.rep-health` / `data-severity` accent + icon + text label; never colour-only). The aggregator maps each
service's existing status into this model (thin lookup, not new health logic), e.g. `getSystemHealth`
`ok→Healthy` / `warn→Warning` / `off→Critical`; `getChannelHealth` `healthy→Healthy` / `degraded→Warning` /
`failing→Critical`.
- **Unknown status *(graceful)*:** any status the map doesn't recognise renders as a **neutral operational
  state ("Unknown")** — informational, never an error, never a thrown failure.

### Diagnostic codes & Recommended Action Registry *(frozen codes — one central lookup)*
Diagnostics are keyed by a **stable, frozen diagnostic code** (e.g. `MISSING_ENV_VAR`, `WEBHOOK_SECRET_MISSING`,
`PROVIDER_DISABLED`, `CREDENTIALS_INVALID`), mapped from each service's existing status/`detail`.
- **Frozen codes (binding):** diagnostic **codes are stable identifiers** — recommended actions reference the
  **code**, not free-form text. **Future wording changes must not change the diagnostic code.**
- **One central lookup:** every **Recommended Action** comes from a single lookup keyed by diagnostic code —
  **recommendation text is never scattered through components.** Read-only guidance only; **no repair actions,
  no writes, no parallel flows.**
- **Diagnostic prioritization:** when an integration has multiple issues, surface **one Primary Diagnostic**
  and **summarize** the rest ("+N more") — operators are never overwhelmed with long lists.
- **Codes as future audit keys (forward-looking, no implementation now):** these diagnostic codes are intended
  to become the **stable identifiers for audit logs, exports, monitoring, and AI troubleshooting** — another
  reason they must stay frozen.

### Provenance contract *(frozen — informational only)*
Each integration exposes exactly two provenance facts: **Configuration Source** (where its config lives) and
**Service Owner** (which service owns its truth). Both are **informational only**, shown alongside the
"Managed by Environment Variables" label.

### Partial-failure & timeout resilience
If one integration **fails to load or is slow/times out**, **only its own panel degrades** (scoped neutral/
error fallback); the remainder of Settings renders normally. Each integration's status is fetched
independently (per-panel `Promise.allSettled`, time-bounded) so a slow integration **never** blocks the page
or other panels.

### Future refresh *(forward rule)*
Any future **"Refresh Status"** action must simply **re-query the existing services** — **no duplicated health
computation, no cached health copies**. The aggregator holds no health state to invalidate.

---

## Phase S1A — Integration Status & Operational Health  *(read-only; correctness/visibility first)*

Read-only status + health for the four integrations, composed from EXISTING service health only.

- **Features:**
  - **Read-only integration panels** — Analytics (GA4 / GTM / Clarity configured?; Meta Pixel "reserved";
    Pinterest / Search Console "not enabled"), Payment (Razorpay **mode Test/Live** from `keyId` prefix,
    configured, webhook health, key validity), Email (provider Resend status, sender, reply-to,
    deliverability), Notifications (per-channel Slack/SMS/WhatsApp/email/in-app/push status). Each labelled
    **"Managed by Environment Variables"** and showing its **configuration provenance** (`analyticsConfig`,
    `commerce.ts`, `emailProvider`, notifications configuration).
  - **Severity + diagnostic + Recommended Action per integration** — the standardized **Healthy / Warning /
    Critical** model (icon + label + reason), reusing the Reports Financial Health banner visual language;
    every unhealthy integration also shows a concise **Recommended Action** (e.g. "Configure webhook secret",
    "Verify credentials"). All mapped from the services' existing status/`detail` — **read-only, no repair.**
  - **Latest successful communication time** — where services already expose it: last webhook (`webhook_logs`
    / health), last email (`getEmailDeliveryHealth.lastSentAt`), last successful notification
    (`getChannelHealth.lastSuccessAt`), last settlement (`razorpaySettlementService`).
  - **Integration Health summary** — Healthy / Warning / Critical **counts**, derived purely by counting the
    statuses the existing services already return (no duplicate health computation).
  - **Notification Test action** — reuses the **existing** `POST /api/admin/notifications/test` (+
    `TEST_PRESETS`/`OpsTester`); after execution, clearly displays **which channels succeeded and which
    failed** (per-channel `results`). No parallel testing flow.
  - **Current application environment** — Development / Staging / Production, read-only, from
    `VERCEL_ENV` / `NODE_ENV`; **if existing build metadata is already available** (e.g.
    `VERCEL_GIT_COMMIT_SHA`), display it too. **No new versioning mechanism.**
  - **Launch Readiness checklist** — a compact summary of critical integrations' operational state. **Every
    item maps directly to an existing health source** (via the registry) — **no manually maintained checklist
    values**, no separate launch logic.
  - **Partial-failure & timeout resilience** — one integration failing/slow degrades **only its own panel**;
    the rest of Settings renders normally (per-panel, time-bounded `Promise.allSettled`).
- **Rendered ONLY from the Integration Registry** (no hardcoded panels), via the read-only Aggregator (see the
  governance section) — severity (Healthy/Warning/Critical/Unknown) + diagnostic reason + Recommended Action
  (central lookup, keyed by diagnostic code) + provenance (Configuration Source · Service Owner).
- **Reuses:** `healthService.getSystemHealth` (Payments/Webhooks/Email/deliverability), `opsEngine`
  (`getChannelHealth`/`channelStatus`, the existing test route), `analyticsConfig`, `RAZORPAY`, `webhook_logs`,
  `razorpaySettlementService`. A single thin **read-only aggregator** composes these.
- **New (presentational only):** the Integration Registry (declarations pointing at existing sources); the
  aggregator view function; a thin status→severity map + the diagnostic-code→Recommended-Action lookup;
  read-only status components. **No config source, no service, no health logic, no DB.**
- **Editable?** None (all read-only). Also replaces the dead editable `analytics.gaId` input with read-only
  analytics status.
- **DB changes:** none. **Dependencies:** none. **Complexity:** Low–Medium.
- **Testing:** **registry integrity test** (every entry has healthSource + diagnostics + provenance +
  owningModule + timestampSource + a recommended-action mapping); **registry authority test** (rendered panels
  == registry entries exactly; removing/bypassing an entry fails); unit-test the status→severity map (incl.
  Unknown fallback), the frozen diagnostic-code→Recommended-Action lookup, primary-diagnostic prioritization,
  and the summary counter (all pure); verify **concurrent aggregation** (single `Promise.allSettled` fan-out);
  live local-Supabase QA of the panels (configured vs unconfigured), severity styling, timestamp provenance,
  Launch Readiness, environment/build label, Notification-Test per-channel results, partial-failure/timeout.
- **Rollback:** additive section — removable without touching anything else.
- **Verification gate:** panels render **only from the registry**; standard Healthy/Warning/Critical (+Unknown
  neutral) model (icon+label+reason) + a Recommended Action (central lookup) when unhealthy + provenance +
  "Managed by Environment Variables"; last-success times where available; Health summary + Launch Readiness map
  **directly to existing health sources** (no manual values); environment (+build metadata if present) correct;
  Notification-Test shows per-channel results via the existing endpoint; **registry integrity test passes**;
  **PANEL ISOLATION PROVEN — every integration panel still renders correctly when every OTHER integration is
  unavailable** (slow or failing); **zero duplicate health logic**; **editing/saving unrelated Settings works
  regardless of integration health**; no redesign.

---

## Phase S1B — Editable Settings Improvements  *(usability; only site_settings-backed fields)*

- **Features:**
  - **Financial-field validation** (client **and** server) — packaging ≥ 0, courier ≥ 0, gateway % within a
    valid range. **Corrective messages** ("Gateway fee must be between 0 and 100 — enter e.g. 2 for 2%"),
    not just "invalid".
  - **Better save feedback** — clear success/error, surfaced validation errors inline.
  - **Unsaved-changes warning** — reuse `shouldGuardNavigation` (`lib/bundleNavGuard.ts`, the pure Bundle-CMS
    guard) + `beforeunload`, mirroring `BundleEditor`. Dirty = `s` vs original `settings`.
  - **Audit summary** for editable Settings — surface **Updated By · Updated At · Changed Groups**, reusing
    `auditService.getRecentAuditEvents({ entityType: "settings" })` (already records actor, time, and the
    changed groups on every `updateSiteSettings` / `updateShippingSettings`). **Reuse `auditService` only — no
    new audit storage, no new tracking.**
- **Reuses:** `SiteSettingsForm` + `/api/admin/settings/site` (validation seam); `bundleNavGuard`;
  `auditService`. **Server validation** added in the site route (defense-in-depth) — no new service.
- **DB changes:** none. **Dependencies:** none. **Complexity:** Low.
- **Testing:** validation-helper unit tests (each corrective message); unsaved-guard reuse (already covered by
  `bundleNavGuard.test`); live QA of save/validation/guard + "last updated by" display.
- **Rollback:** additive/guarded.
- **Verification gate:** invalid financial values are blocked with corrective guidance; save feedback clear;
  unsaved-nav guarded; last-updated/by shown from audit; **no new tracking or services**.

---

## Phase S2 — Operational Enhancements  *(optional; some net-new fields)*

- **Features:** **Free shipping threshold** — **read-only for launch (decided)**, see below; **shipping cutoff
  time** + **dispatch SLA** (net-new `shipping_settings` fields, engine reads them); **business address**
  improvements (surface/edit — exists in `COMMERCE`/warehouses); **provider connection testing** (Razorpay
  ping / email test-send; notifications test already exists). GST/financial stays **read-only** (code-managed).
- **Reuses:** `settingsService`/`shippingSettings`, `warehouseService`, existing test route, `RAZORPAY`/email
  libs for connection tests.
- **DB changes:** possibly small `shipping_settings` additions (cutoff/SLA) — TBD at S2 planning.
- **Complexity:** Medium. **Testing/Rollback/Gate:** defined at S2 planning (after S1A + S1B approved).

### Free Shipping Threshold — DECIDED: read-only for launch
`SHIPPING.freeThreshold = 1499` stays **money-engine code**; Settings displays it **read-only** for launch
(matches "money-critical config stays in code"). Making it editable is **explicitly deferred to a dedicated
post-launch checkout/shipping configuration project** — not moved into editable Settings before launch.

---

## Deferred (P2 + unsupported)
YouTube / X / LinkedIn social, Twitter Card SEO, delivery promise, backup dashboard, security enhancements —
**plus Pinterest Tag & Search Console verification** (platform does not support them today; net-new, not reuse).
Any of these becoming in-scope requires an explicitly approved new phase.

---

## Platform Backlog *(pre-existing, NOT S1A — surfaced during S1A verification; kept OUT of the S1A commit)*
- **`/admin/settings` horizontal overflow on tablet/mobile** — the existing **Providers `admin__table`** is
  rendered without `.admin__table-wrap` (overflow-x container). The S1A Integration Status section itself
  stacks cleanly (verified); this is pre-existing page content. Fix = wrap the Providers table in
  `.admin__table-wrap` (one line). Tracked separately, not part of S1A.
- **CookieConsent overlays `/admin/*`** — the storefront consent banner renders on admin routes (also on the
  Reports platform backlog). Fix = hide `CookieConsent` on `/admin/*`. Tracked separately.
