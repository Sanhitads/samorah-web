# Notification Center — Future Enhancements

Deliberately deferred items from the review passes, recorded so they're not lost. The core
(enriched alerts, deep-links, retry, banner, severity, dedup, filters, search, snooze, bulk,
metrics, health header, incident MVP, trends, real-time) is shipped.

## Deferred — explicitly "later" per review

- **Filter states** (review pt 2): `Assigned to me`, `Unassigned`, `Acknowledged`, `Resolved`,
  `Snoozed`. The data exists (`notification_state`); add these as filter chips + a `state`/
  `assignee` filter on the client + a lightweight server filter. No schema change needed.
- **Bulk: Resolve all / Export / Snooze all** (review pt 4). "Assign all" + "Retry all" already
  ship. `Snooze all` is a small addition (bulk endpoint already accepts `alertKeys` + `snoozeMinutes`).
  `Export` = CSV of the current filtered view. `Resolve all` = bulk `state:"resolved"`.

## Deferred — need more design/infra

- **Details drawer** (pt 8.1): a right-side drawer with details/retry/assign/logs instead of a
  page nav. Inline expansion already provides retry/assign/review; the drawer's extra value is a
  full per-item event timeline + gateway logs in one place. Build alongside a per-item timeline API.
- **Keyboard R / A / S** (pt 8.2): `/` (focus search) ships. R/A/S (retry/assign/snooze) need an
  item-focus model (j/k navigation + a "focused row"), which is a larger interaction layer.
- **Per-role preferences** (earlier review): needs a department/team model (warehouse / finance /
  marketing) — current roles are editor/manager/admin.
- **Slack/email escalation** (earlier review): needs an escalation cron + a Slack/email webhook.
- **Full incident correlation**: the MVP (N gateway errors in a window → one incident flag) ships.
  A real engine would cluster by error signature + time + affected subsystem and open/track an
  incident object with a timeline and status.
