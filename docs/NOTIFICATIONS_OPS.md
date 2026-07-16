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

---

# Production hardening (resilience · observability · scale)

Additive to everything above — the event model (`group_id`), routing, preferences, retry and the
feed are unchanged.

## Dead Letter Queue (+ automatic retry)
Previously a permanent failure sat as `failed` forever and **nothing auto-retried**. Now:

```
send → failed → (1m) retry → (5m) retry → (15m) retry → policy exhausted → DEAD LETTER QUEUE
                                                                              ↕ manual replay
```
- `RETRY_POLICY` (config): `maxAttempts: 4`, backoff `[1, 5, 15]` minutes, and `autoRetryChannels`
  (in-app is never "retried" — it isn't a provider; `skipped` is never retried — it isn't a failure).
- **Worker**: `/api/cron/notifications-retry` every 5 min → `runRetryWorker()`. A transient Slack /
  Resend outage self-heals with no human involved.
- **DLQ** = the terminal `dead` status — deliberately a *state*, not a separate table, so the row keeps
  its `group_id`, payload, retry history and drill-down. It carries `dead_at` + `dead_reason`.
  **Nothing is ever discarded.**
- **Replay**: `replayDeadLetter()` (drawer button / `action: "replay"`). One attempt — success revives
  the row and clears the dead flags; failure returns it to the DLQ. Audited via
  `replayed_at`/`replayed_by` plus `retry_history`.
- A banner surfaces the DLQ; the `☠ Dead letters` chip filters to it.

## Event timeline
`buildTimeline()` (pure) assembles the chronological story from data already stored — creation →
per-channel dispatch → retries → replay → DLQ → read → acknowledged — rendered in the drawer.

## Channel health metrics
`getChannelHealth()` per channel: **last successful delivery**, **last failure**, **average latency
(24h)**, 24h delivered/failed volumes, DLQ count, and a state:
`healthy` · `degraded` (some failures) · `failing` (failures and zero deliveries) · `dormant` · `pending` (WhatsApp).

## Cursor pagination
The feed was scanning up to 2000 ids and slicing in JS. It now uses a **keyset cursor on
`created_at`** (index `notification_log_cursor_idx`), `limit` ≤ 100, with `nextCursor`/`hasMore` —
no offsets, safe at 50k+. Changing any filter resets the cursor.

## Notification correlation
Repeated failures from one root cause share a `correlation_id`, so **50 payment failures collapse into
one feed item** ("×50 affected") while every event stays drillable in the drawer.
- `correlationKeyFor()` (pure, config-driven): only noisy failure events correlate — reports never do.
  The key includes the root incident when known (`payment.failed:incident:INC-00042`).
- A new event joins the newest correlation with the same key inside `CORRELATION.windowMinutes` (15).
- Feed unit = `correlation_id ?? group_id`.
- *Known trade-off:* a correlation whose events straddle a page boundary can appear on both pages
  (it always shows its true total). Cosmetic — never data loss.

## Presentation
Severity is a coloured left rail (green/amber/red — the notification model is 3-level `info/warning/
critical`; no 4th "high" level was invented). Channels render with icons (label shown ≥1100px).

## Tests
`ops.test.ts` (31): retry decisions incl. backoff/exhaustion/channel guards, correlation keys,
timeline assembly (incl. retries, replay, DLQ hand-off), channel icons — plus the earlier routing /
SMS-critical / retention / preset suites. Schema verified live: DLQ transition + reason, DLQ query,
replay audit fields, correlation binding 3 events into one unit, cursor keyset — self-cleaning.

### End-to-end DLQ run (against the real retry worker, 17/17)
Driven with a **genuinely failing provider** (Resend to an invalid recipient) rather than a mock:

| Verified | Result |
|---|---|
| Backoff guard | a not-yet-due failure is left untouched |
| Channel guard | `in_app` is never auto-retried (it isn't a provider) |
| Real failure → retry | attempts 1 → 2, real error captured (`resend 422 validation_error`) |
| Backoff scheduling | next attempt scheduled per policy; recorded in `retry_history` as `retry-worker` |
| **Auto-recovery** | a failed Slack row re-dispatched and **delivered** (572 ms) — self-healing works |
| **Policy exhausted → DLQ** | `status=dead`, `dead_at` stamped, `dead_reason` = the **real provider error** |
| No further retries | `next_retry_at` cleared once dead |
| Nothing lost | full `retry_history` preserved through the chain |
| DLQ view | the dead letter is listed |
| Idempotency | re-running the worker does not touch dead letters (no retry storm) |

All synthetic rows removed afterwards.

---

# Notification Analytics (`/admin/notifications-log/analytics`)

How the **notifier itself** is performing. Every number derives from `notification_log` rows in the
window — nothing is estimated. Window: 7 / 30 / 90 days.

| Metric | Definition |
|---|---|
| **Delivery rate** | delivered ÷ (delivered + failed + dead). `skipped` is excluded — a dormant channel isn't a failure |
| **Events / dispatches** | distinct `group_id`s vs individual channel rows |
| **Failures / DLQ** | current failures, and how many are parked in the Dead Letter Queue |
| **MTTA** | mean(`acknowledged_at` − `created_at`) over critical alerts — how fast someone owned it |
| **MTTR** | mean(`last_attempt_at` − `created_at`) for dispatches that **recovered** (delivered after ≥1 retry) |
| **Mean time to read** | mean(`read_at` − `created_at`) |
| **Per channel** | sent · failed · DLQ · delivery % · avg · **p50** · **p95** latency · last success |
| **Top notification types** | volume per event (with failure count), tagged by category |
| **Top failure reasons** | provider errors grouped by signature via `failureReasonKey()` (e.g. `resend 422`) so a recurring fault is obvious rather than fragmented across unique JSON bodies |
| **Daily volume** | delivered vs failed per day |

**Test-preset notifications are excluded by default** (they'd flatter delivery stats); toggle
"Tests included" to see them.

**Why p95:** an average hides the slow tail. Nearest-rank percentile — note p95 of 20 samples is the
19th value, so a single 1-in-20 spike is p100, not p95.

---

# Phase 16 — Operations Enhancements

Additive: the engine, routing model, correlation model and existing columns are unchanged.

## Deduplication / noise suppression
"Gateway down ×27 in 30 seconds" becomes **one** Slack post with a counter.
- Key = `event | entity | severity` (`dedupKeyFor`), window `DEDUP.windowMinutes` (5).
- The first dispatch in the window is the **leader**; repeats bump `occurrence_count` +
  `last_occurrence_at` and are written to **`notification_occurrences`** — so channels stay quiet
  while **every occurrence survives in the audit trail**.
- Reports/deploy notices are excluded — they must arrive every time.
- Feed shows `↻ Repeated 27× · last 2s ago`.
- **Distinct from correlation:** correlation groups *different* events sharing a root cause for
  display; dedup suppresses *identical* events at dispatch time.

## Channel rate limiting
Dedup catches identical floods; rate limiting caps a channel regardless of variety (100 *different*
failing orders would still be 100 posts).
- `RATE_LIMITS` per channel (slack 20/min · email 10/min · sms 3/5min); `in_app` is uncapped (a DB
  row, not a provider call).
- Over the cap the dispatch is **queued** (`status='queued'` + `next_retry_at`) and drained by the
  existing retry worker → **delayed, never dropped**. A queued row spends no attempts and can never
  reach the DLQ.
- **`RATE_LIMIT_BYPASS` = critical** — an emergency is never throttled.

## Live feed
`notification_log` had RLS enabled with **no policies**, so a browser Realtime subscription would
have silently received nothing. The migration adds a staff `SELECT` policy (`public.is_editor()`)
and publishes the table to `supabase_realtime`. `OpsLiveFeed` subscribes and refreshes the server
component — feed, counters, badges and channel status update together. Refreshes are **debounced**
(a fan-out inserts one row per channel; that's one refresh, not five) and fall back to a 30s poll if
the socket never connects. The indicator shows Live vs Polling.

## Analytics dashboard → `/admin/notification-analytics`
Adds to the earlier metrics: **retries/day**, **replay success rate**, **queued (rate limited)**,
**noise suppressed**, **hourly distribution**, **top noisy alerts** (dedup counters), **failure rate
by category**, and per-channel **uptime 7/30/90d** (delivery success over the trailing period;
dormant/queued excluded — a throttled channel isn't down).

## End-to-end retry verification (development only)
`POST /api/admin/notifications/verify` + a **dev-only** card on the Ops Center.
Drives the **real** lifecycle with the **real** worker and a **real** provider rejection (email to an
invalid recipient — not a mock):

```
sending → failed → retry(1m) → retry(5m) → retry(15m) → DLQ → reconnect → replay → delivered
```
Returns a step-by-step report plus a `verified` block (`reachedDlq`, `deliveredOnReplay`, `attempts`,
`retryHistoryEntries`, `replayAudited`, `nothingLost`). **Time is compressed** — each step advances
`next_retry_at` into the past; the backoff logic itself is untouched, we only fast-forward the clock.
Refuses to run in production; cleans up unless `keep: true`.

---

# Deferred backlog (agreed, not built)

Everything raised in review that was **consciously deferred** — recorded so nothing is lost. Each row
says who deferred it and why. Nothing here is forgotten; it's queued.

| Item | Raised | Status / why deferred | Notes for when we build it |
|---|---|---|---|
| **Bulk operations** (select → delete / retry / archive / mark read) | Ops Center review #4 | Deferred — *"not required today"* (reviewer) | Feed already has stable `group_id`s to select on |
| **Export** (CSV / Excel / PDF) for audits | Ops Center review #6 | Deferred — outside the "add only" scope of the hardening pass | The incidents module already has a CSV/XLS export route to copy |
| **SLA tracking on notifications** (target, countdown, overdue) | Ops Center review #8 | Deferred — incidents already carry SLA; notification-level SLA is new scope | Would reuse the incident SLA config shape |
| **Escalation chain** (Slack → 5m → Email → 10m → SMS → 15m → Phone → Manager → Founder) | Ops Center review #9 | Deferred — *"not necessary before launch"* (reviewer). The incident engine already has a 3-level time policy | Extend `ESCALATION_POLICY`; the ladder is config, the dispatcher already exists |
| **Attachments** (invoice PDF, screenshot, log, CSV) | Ops Center review #10 | Deferred — needs a storage decision (Supabase Storage vs Cloudinary) + retention rules | Slack Block Kit + Resend both support attachments |
| **Notification policies in Settings UI** | Ops Center review #13 | Deferred — the `notification_preferences` table + engine support already exist; only the Settings screen is missing | Per-user, scoped by event **or** category; broadcast Slack stays channel-wide |
| **Notification dependencies** (business event chains: payment failed → order cancelled → refund failed) | Phase 16 priority #3 | Deferred — *"would be nice"* (reviewer). Distinct from channel correlation, which groups by root cause | Would need a causal link between events, not just a shared root cause |
| **Scheduled / automatic replay** (gateway recovers → auto-replay the DLQ) | Phase 16 priority #5 | Deferred — outside the "build only" list | Risk: a mass auto-replay could re-flood channels; must combine with rate limiting |
| **Channel configuration from the UI** (webhook URL, retries, digest time, toggles) | Phase 16 priority #8 | Deferred — *"eventually"* (reviewer). Secrets in the DB need care | Non-secret knobs (retries, digest time, toggles) could move first; keep webhook URLs/keys in env |
| **Full change audit** (who disabled a channel / changed routing) | Phase 16 priority #9 | **Partially built** — acknowledge (`acknowledged_by`) and replay (`replayed_by`) are already attributed; retries record the actor in `retry_history`. Missing: config/routing change history | Routing lives in code config today, so its history is git. An `audit_logs` table exists to extend |
| **WhatsApp transport** | Phase 5 | Blocked on a dedicated business number (reviewer). Channel structure + renderer are built and dormant | Set `WHATSAPP_*` env → one transport function |
| **Real SMS delivery** | Phase 5 | Blocked on MSG91 DLT template approval | Set `MSG91_*` env; channel is built, critical-only, and dormant |

## Design notes
- The customer-transactional engine (`notify()`, `notification_dispatches`, order/return emails) is **unchanged**.
- Operational dispatches are logged to a separate `notification_log` table (additive migration `20260722120000`).
- Unconfigured channels are **skipped, never failed** — dormant WhatsApp/Push/SMS don't break a fan-out.
