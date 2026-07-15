# Incident Management — Phases 1 & 2

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

## Roadmap (Phase 3 — not yet built)
Analytics, intelligence, escalation, enterprise. Inventory-sync incidents activate once an inventory
sync-failure event source exists (`enabled:false` today).
