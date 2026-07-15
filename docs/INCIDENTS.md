# Incident Management — Phases 1, 2 & 3

A correlation layer **above** notifications. Notifications are unchanged; incidents group the
notifications caused by one operational problem, to cut noise (Datadog / Stripe style). **No AI** —
deterministic, configurable rules.

```
Dashboard → Incidents → Notifications → Orders / Payments / Shipments / Inventory
```

## Model

| Table | Purpose |
|---|---|
| `incidents` | one row per correlated problem — number (`INC-00014`), title, category, severity, status, root cause, source system, assignee, affected counts, timestamps, resolution notes |
| `incident_notifications` | notifications attached to an incident, referenced by their stable `alert_key` (never duplicated) |
| `incident_history` | immutable timeline (created / assigned / status_changed / notification_added / notification_resolved / resolved / note_added) |

`notification_state` is untouched. Incident **status** (open · investigating · mitigated · resolved ·
closed) is independent of notification status. **Severity** (critical · high · medium · low · info)
auto-inherits from the highest-severity attached notification.

## Rule engine

Pure logic in `src/lib/incidents/engine.ts` (unit-tested); orchestration in
`src/services/incidentService.ts`. Rules + thresholds are **configuration**, not hardcoded, in
`src/config/incidents.ts`:

| Rule | Source | Threshold / window | Category |
|---|---|---|---|
| `refund_gateway_timeout` | refunds (failed, reason ~ timeout/gateway/5xx) | ≥5 in 5 min | Refund |
| `payment_gateway_failures` | payment_attempts (failed) | ≥10 in 5 min | Payment Gateway |
| `shipment_provider_errors` | shipments (exception) | ≥5 in 30 min | Shipment |
| `email_delivery_failures` | notification_dispatches (failed) | ≥10 in 30 min | Email |
| `inventory_sync_failures` | *(inert — no sync-failure source yet)* | ≥5 in 15 min | Inventory |

Adding a category = add a rule object. Tune a threshold = edit one number.

### Correlation
`correlateIncidents()`: for each rule, count matching windowed failures; if `count ≥ threshold`, find
an active same-category+rule incident inside its `mergeWindowMinutes` and **attach** to it (merge),
else **open** one. Newly-affected notifications are attached by `alert_key`; severity/counts/last-activity
recompute. **Idempotent** — re-running merges instead of duplicating.

### Auto-resolution
`autoResolveIncidents()`: an attached notification is marked resolved once its underlying condition
clears (its `alert_key` is no longer in the current failing set). When **every** notification in an
incident is resolved, the incident is auto-marked **Resolved** — no manual closure required.

### When it runs
- **Cron** `/api/cron/incidents` every 5 min (vercel.json) — the primary driver.
- **Manual** "Run correlation" button on the incident list.

## API

- `POST /api/cron/incidents` — run correlation (CRON_SECRET).
- `POST /api/admin/incidents/action` — staff-gated: `{ action: "correlate" }`, or
  `{ number, action: "assign" | "status" | "note", status?, note? }`.

## UI

- **Dashboard** (`/admin`) — incident widget: Critical / High / Open / Resolved today / Avg resolution / Oldest open.
- **List** (`/admin/incidents`) — Incident · Category · Severity · Status · Orders · Started · Last activity · Assigned · Actions; Open/All views; Run correlation.
- **Detail** (`/admin/incidents/[number]`) — Overview · Timeline · Affected orders · Affected notifications · Resolution notes · System logs · Related incidents; assign / change status / add note.
- **Notification** items show `🚨 INC-00014` when part of an incident → View incident.
- **Order page** shows "This order is part of Incident INC-00014."

## Tests

- `src/lib/incidents/engine.test.ts` — severity inheritance, threshold firing, reason matching,
  alert-key derivation, merge decisions, auto-resolution, number formatting (14 tests).
- Full DB-integration correlation/auto-resolution is verified via an end-to-end scenario against the
  live schema (documented in the PR); a dedicated test DB harness is the follow-up for CI integration tests.

---

# Phase 2 — Operations & Collaboration

Built **above** Phase 1 (nothing in Phase 1 was redesigned). Adds ownership, teams, workflow, notes,
checklists, snooze, search/filter, and export. **Audit-first: nothing is deleted** — every action
appends to `incident_history`; notes are append-only.

## Model additions

| Table / column | Purpose |
|---|---|
| `incidents.owner_id/owner_name` | the incident owner — set to the **first** person assigned |
| `incidents.assignee_id/assignee_name` | current assignee (reassignable = transfer) |
| `incidents.team` | owning team — finance · warehouse · support · marketing · admin |
| `incidents.snoozed_until` | whole-incident snooze; snoozed incidents drop out of the default Open view until it elapses |
| `incidents.severity_locked` | set when a human overrides severity → stops auto-inheritance |
| `incident_participants` | watchers / followers — `(incident_id, user_id, role)` unique |
| `incident_notes` | timestamped operational notes (append-only, never deleted) |
| `incident_checklist_items` | per-incident checklist — label, done, done_by, done_at, sort_order |

All new tables have RLS enabled + `grant all … to service_role`.

## Teams & routing
`CATEGORY_TEAM` (config) routes a new incident to a default team: refund/payment → **Finance**,
shipment/inventory → **Warehouse**, email → **Marketing**, else **Admin**. Reassignable in the UI.

## Checklists
Configurable templates in `INCIDENT_CHECKLISTS` (config) seed onto an incident when it opens.
E.g. Refund → *Retry refund · Verify gateway status · Inform customer · Confirm settlement*. Ticking
an item records who + when.

## Workflow
- **Assign to me / Transfer** (staff picker) — first assignee becomes owner; transfer logged `assigned → transferred`.
- **Remove assignment**, **Watch** (add self as watcher).
- **Team**, **Status**, **Severity** (manual severity locks inheritance), **Snooze** (30 min / 1 h / tomorrow 9am / custom).
- **Notes** — timestamped, attributed, append-only.

## Search / filter / export
- **Search** (`?q=`) across incident ID, title, root cause, gateway/source, team, owner/assignee, **plus** order number & customer name (resolved via `incident_notifications` → `orders`).
- **Filters**: status · severity · category · team · assigned (me / unassigned / anyone) · created today / this week · resolved today.
- **Pagination** (20/page) — the pragmatic stand-in for virtual scrolling; server caps the working set.
- **Export**: `GET /api/admin/incidents/export?format=csv|xls` honours the current filters. CSV + Excel (dependency-free HTML-table `.xls`); **PDF** via the browser print dialog.

## API additions
`POST /api/admin/incidents/action` actions: `assign` (self or `targetId`), `unassign`, `watch`,
`unwatch`, `team`, `status`, `severity`, `note`, `checklist` (`itemId` + `done`), `snooze` (`minutes`).
Each writes `incident_history` with the acting staff member + timestamp.

## UI additions
- **List** — filter bar + search + CSV/Excel/Print + pagination; Team column; 💤 snooze indicator.
- **Detail** — **People** (team / owner / assignee / watchers / followers), **Checklist**, **Notes** stream, and a toolbar (assign · transfer · remove · watch · team · status · severity · snooze). Activity log now labels all collaboration events.

## Tests
- `src/lib/incidents/collaboration.test.ts` — category→team routing, checklist templates, `matchesIncidentSearch` predicate (7 tests).
- `engine.test.ts` still green (14). Live end-to-end scenario exercises every new table/column with the service_role client and cleans up (11 checks).

---

# Phase 3 — Enterprise Operations Intelligence

Makes it *smart* — still 100% deterministic and **explainable** (no AI, no hallucinations). Every
number traces to concrete rows; every classification/escalation records *why*. Built above Phases
1 & 2 without redesigning them.

## Model additions (migration `20260720120000_incidents_intelligence.sql`)

| Column / table | Purpose |
|---|---|
| `incidents.root_cause_system` | detected upstream system — razorpay·shiprocket·smtp·inventory·database·supabase·unknown |
| `incidents.parent_incident_id` | child → primary link for a cross-system correlation group |
| `incidents.subsystem` | health-dashboard grouping — payments·inventory·shipping·email·checkout·customers |
| `incidents.detected_at` | first underlying failure time → Mean Time To Detect |
| `incidents.escalation_level` | 0 none · 1 manager · 2 admin · 3 channels |
| `incidents.prevention` / `kb_resolution` | knowledge base (required to resolve) |
| `incidents.impact_*` | business-impact snapshot (orders, revenue, customers, refund value, shipments delayed) |
| `incident_escalations` | append-only escalation ledger — level, target role, channels, reason, age; unique per (incident, level) |
| + 8 indexes | category / root cause / subsystem / parent / resolved / started / assignee / open-notifications — sized for 100k+ / 10k+ |

## Advanced correlation (cascade → ONE incident)
After per-rule correlation, `groupCrossSystem()` links active incidents that share a
`root_cause_system` and started within `CROSS_SYSTEM_WINDOW_MIN` (20 min) under the earliest as
**primary** (`parent_incident_id`). So gateway-timeout → refund-failed → payment-failed → email-failed
reads as one Payment-Gateway incident. Reversible (only sets a pointer) and logged both ways.

## Root cause detection
`classifyRootCause()` evaluates `ROOT_CAUSE_RULES` in order — source system → category → reason
regex — returning the system **and the signal that matched** (shown as "Why:" in the UI). Configurable.

## Health dashboard
`getSystemHealth()` scores each subsystem Healthy / Warning / Critical from its active incidents
(`subsystemHealth`), with the reason; overall = worst subsystem. Rendered as a strip on the incident
list and the analytics page. Thresholds in `HEALTH_THRESHOLDS`.

## Escalation
Time-based policy `ESCALATION_POLICY` (30 min → **Manager**, 1 h → **Admin**, 2 h → **Slack/Email/SMS**),
severity ≥ medium. `runEscalations()` (in the cron) fires each level once (DB uniqueness), records a
ledger row + history with the reason, and dispatches: **email is sent** to the role's users (Resend, if
configured); **Slack/SMS are logged** (not yet integrated — the trail stays complete).

## Business impact
`computeBusinessImpact()` estimates blast radius from the incident's affected orders — orders,
revenue (`orders.total_amount`), distinct customers, refund value (`orders.refund_amount`), and
shipments delayed (`shipment_exceptions type=delayed`). Snapshotted on the incident; refreshed each
cron cycle (bounded) and finalised on resolve.

## Analytics
`getIncidentAnalytics(days)` → total / open / resolved, **MTTD**, **MTTR**, avg resolution, top incident
types, most common root causes, and monthly opened/resolved trends. Page: `/admin/incidents/analytics`.

## Knowledge base + related incidents
Resolving via the UI **requires** root cause + resolution + prevention (`resolveWithKnowledge`) — stored
so future incidents can reuse the fix. `getSimilarIncidents()` scores resolved incidents by resemblance
(category 0.4 · root cause 0.4 · source 0.2) and surfaces the top matches with their prior fix
("This incident resembles INC-00008.").

## Archive
Historical search/compare/export reuses the Phase 2 filtered list (`/admin/incidents?status=all`) +
export, alongside the analytics trends.

## Performance & testing
- **Indexes** sized for the target scale; queries stay indexed + paginated.
- **Load test** at **10,000 incidents / 100,000 notifications**: list/filter/search/health/analytics
  all **45–71 ms** (best of 3); **20 concurrent** list queries in **414 ms**; data cascade-cleaned.
- **Unit tests**: `intelligence.test.ts` (19) — classification, health, escalation timing, resemblance,
  correlation window, MTTR/MTTD math; total incident suite **40 green**.
- **Live scenario** (via the real cron/service): correlation → root-cause razorpay → cross-system
  grouping → L1 manager escalation (idempotent) → impact snapshot → KB resolve → related surfacing →
  health/analytics — **15/15**, self-cleaning.
- **Realtime**: covered by the existing notifications `postgres_changes` subscription + 30 s poll
  fallback (Phase 1); incident changes flow through the same channel.

## Cron
`/api/cron/incidents` now runs correlation → escalation → impact refresh each cycle (every 5 min).
