# Operational Notification Engine (multi-channel)

Staff-facing alerting: **one engine, per-event routing, many channels.** Built *alongside* the
existing customer-transactional `notify()` engine (which is untouched) — same channel philosophy,
different audience and payload.

```
Database event
      │
      ▼
notifyOps(event, payload)         ← src/lib/notifications/opsEngine.ts
      │  (resolves OPS_ROUTES[event] → channels + slack channel + severity)
      ├── In-app     always            (notification_log → /admin/notifications-log)
      ├── Email      summaries/critical (ops email to admins/managers)
      ├── Slack      operational        (Incoming Webhook, Block Kit, per-area channel)
      ├── SMS        CRITICAL only       (MSG91, DLT)      — dormant until env set
      ├── WhatsApp   future              — structure ready, dormant
      └── Push       future              — structure ready, dormant
```

**Not every notification goes to every channel.** Each event's rule lives in `OPS_ROUTES`
(`src/config/notifications.ts`) — edit there to re-route; no engine/channel change needed.

## Priority model
1. **In-app** — always (dashboard feed).
2. **Email** — reports, summaries, critical.
3. **Slack** — operational detail (orders, inventory, payments, refunds, errors, deploys).
4. **SMS** — CRITICAL only (gateway down, site down, DB unavailable, security, oversell). The SMS
   channel **refuses anything below `critical`**, so a mis-routed event can never spam SMS.
5. **WhatsApp** / 6. **Push** — future; `configured()===false` until env is set (plug-and-play).

## Slack (Incoming Webhook)
- Default channel `#samorah-ops` → `SLACK_WEBHOOK_URL` (**set — live**).
- Optional per-area webhooks (fall back to default until set):
  `SLACK_WEBHOOK_ORDERS`, `SLACK_WEBHOOK_PAYMENTS`, `SLACK_WEBHOOK_WAREHOUSE`,
  `SLACK_WEBHOOK_CUSTOMERS`, `SLACK_WEBHOOK_MARKETING`, `SLACK_WEBHOOK_TECH`.
- Rich Block Kit: severity colour bar + header + labelled fields + "View →" button.

## SMS (MSG91) — set these to activate
```
MSG91_AUTH_KEY=          # API auth key
MSG91_SMS_TEMPLATE_ID=   # approved DLT flow template id
MSG91_SMS_VAR=body       # the template variable holding the alert text (default "body")
MSG91_ALERT_NUMBERS=91xxxxxxxxxx,91yyyyyyyyyy   # critical-alert recipients
```
Until set, `smsChannel.configured()` is false and SMS is cleanly skipped.

## WhatsApp (future — needs a dedicated business number)
`WHATSAPP_PROVIDER` (`msg91`|`cloud`), `WHATSAPP_AUTH_KEY`, `WHATSAPP_FROM`, `WHATSAPP_TEMPLATE`,
`WHATSAPP_ALERT_NUMBERS`. The message renderer is already implemented; only the transport is pending.

## Events & routes (excerpt)
| Event | Channels | Slack |
|---|---|---|
| `order.placed` / `order.high_value` | in-app, slack | #orders |
| `payment.failed` | in-app, slack | #payments |
| `payment.gateway_down` | in-app, email, slack, **sms** | #payments |
| `refund.failed` | in-app, email, slack | #payments |
| `inventory.low_stock` | in-app, slack | #warehouse |
| `inventory.sync_failed` | in-app, slack, **sms** | #warehouse |
| `review.negative` / `support.escalation` | in-app, slack | #customers |
| `tech.error` / `cron.failed` / `webhook.failed` | in-app, slack | #tech |
| `api.down` / `site.down` / `security.incident` / `database.unavailable` | in-app, (email), slack, **sms** | #tech |
| `daily.sales_report` | slack, email | #samorah-ops |
| `incident.escalated` | policy-driven (in-app/email/slack/sms) | #tech |

## Wired emitters (real, no mocks)
- **Order finalized** → `order.placed` / `order.high_value` (razorpay webhook, best-effort).
- **Incident escalation** → real Slack/SMS via the engine (Phase 4 escalation now dispatches for real; SMS only when the incident is critical).
- **Daily sales report** → `daily.sales_report` cron (`/api/cron/notifications-daily`, 09:00 IST) — yesterday's orders/revenue/pending/cancelled/AOV.

## Verify / operate
- **Test tool**: `/admin/notifications-log` → "Send a test" fires a sample and shows per-channel results.
- **Feed + channel status**: the same page lists the live `notification_log` and which channels are live vs dormant.
- **API**: `POST /api/admin/notifications/test` (staff) → `{ channels?, slackChannel?, severity? }`.

## Tests
- `src/lib/notifications/ops.test.ts` (11) — Block Kit builder, SMS critical-only guard + one-liner, ops email HTML, and routing invariants (**SMS only on critical events**).
- Live verification: real Block Kit post to the webhook (HTTP 200 `ok`) + `notification_log` insert/grant, self-cleaning.

---

# Operations Center (`/admin/notifications-log`)

The command view for the engine — "Gmail for Operations".

## Delivery lifecycle (real, not cosmetic)
`queued → sending → delivered | failed → retrying`. The row is written **before** the attempt with
status `sending`, then finalised with the terminal status + measured latency — so an in-flight or
crashed dispatch stays visible instead of vanishing. `queued` is reserved for a future async queue.
`delivered` = the provider accepted it (Slack 200 / Resend accepted / MSG91 queued).

## Feed grouping
One `notifyOps()` fan-out shares a `group_id`, so the feed shows **one item per event** with its
channels — not one row per channel. Filtering finds matching groups first, then loads all their
channel rows, so a filtered view never shows a partial channel set.

## Features
| Capability | How |
|---|---|
| **Top cards** | Notifications today · Critical alerts · Delivery rate · Failed · Average delivery · Awaiting acknowledgement |
| **Channel health** | Per-channel Healthy / Dormant / Pending (WhatsApp) from `configured()` |
| **Filters** | Category chips (Orders/Payments/Inventory/Warehouse/Marketing/Customers/System) + Critical + Unread + Failed. Category is stored on the row → indexed |
| **Search** | Order id / customer / event / type, server-side, backed by a **pg_trgm GIN index** so ILIKE stays fast at 50k+ rows |
| **Status** | Full lifecycle per channel + a worst-wins rollup per event |
| **Retry** | Re-attempt a failed dispatch from the drawer; appends to `retry_history` (at/status/error/by) and bumps `attempts` — never duplicates the feed item |
| **Statistics** | Delivery rate = delivered/(delivered+failed); average delivery from measured `delivery_ms` — these monitor the notifier itself |
| **Test presets** | Test New Order · Payment Failure · Critical Incident · Inventory Alert — fire each event's **real payload through its real route**; tagged `test` so retention purges them in 30 days |
| **Detail drawer** | Event, severity, payload, channels attempted, targets, timestamps, latency, errors, retry history, acknowledge |
| **Bell badge** | Unread count in the nav (red when a critical alert is unacknowledged); polls 60s + on focus. Mark-all-read + Unread filter |
| **Acknowledge** | Critical alerts record `acknowledged_at` / `acknowledged_by` |

## Retention (the log cannot grow forever)
| Class | Kept | Applies to |
|---|---|---|
| `high` | **2 years** | critical severity, incident escalations, security |
| `operational` | **180 days** | everything else |
| `debug` | **30 days** | test-preset notifications (`entityType: "test"`) |

Every row is stamped with `expires_at` on write; the **purge cron** (`/api/cron/notifications-purge`,
20:00 UTC nightly) deletes expired rows.

## Scheduled digests
- **09:00 IST** `/api/cron/notifications-daily` — yesterday's orders, revenue, pending, cancelled, AOV.
- **18:00 IST** `/api/cron/notifications-digest` — today's operations: orders/revenue, low-stock SKUs,
  failed payments, open incidents (critical count), pending shipments. Severity escalates to
  warning/critical when there's something to act on.

## User preferences (`notification_preferences`)
Per-user channel opt-outs, scoped by `event` **or** `category`. Applied today to **per-user channels**
(email: an opted-out manager is dropped from the recipient list); broadcast channels (a Slack channel)
stay channel-wide by nature. WhatsApp/push will honour the same table when they go live.

## Design notes
- The customer-transactional engine (`notify()`, `notification_dispatches`, order/return emails) is **unchanged**.
- Operational dispatches are logged to a separate `notification_log` table (additive migration `20260722120000`).
- Unconfigured channels are **skipped, never failed** — dormant WhatsApp/Push/SMS don't break a fan-out.
