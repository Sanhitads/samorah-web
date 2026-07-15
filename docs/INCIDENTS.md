# Incident Management — Phase 1

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

## Roadmap (Phase 2 / 3 — not in Phase 1)
Collaboration & ops workflow (Phase 2); analytics, intelligence, escalation, enterprise (Phase 3).
Inventory-sync incidents activate once an inventory sync-failure event source exists (`enabled:false` today).
