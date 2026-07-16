-- Notification Operations Center — production hardening. ADDITIVE only: preserves the event model
-- (group_id), routing, preferences, retry logic and the feed. Adds:
--   • Dead Letter Queue  — a terminal `dead` state once the retry policy is exhausted, with the
--     reason kept alongside the existing retry_history, and manual replay (nothing disappears).
--   • Automatic retry    — next_retry_at drives a backoff worker (manual retry is unchanged).
--   • Correlation        — repeated failures from one root cause share a correlation_id so the feed
--     can collapse "50 payment failures" into one item WITHOUT losing drill-down.

alter table public.notification_log
  add column if not exists next_retry_at   timestamptz,   -- backoff schedule for the auto-retry worker
  add column if not exists dead_at         timestamptz,   -- moved to the DLQ at
  add column if not exists dead_reason     text,          -- why it was given up on (last provider error)
  add column if not exists replayed_at     timestamptz,   -- last manual replay out of the DLQ
  add column if not exists replayed_by     text,
  add column if not exists correlation_id  uuid,          -- shared by repeated failures of one root cause
  add column if not exists correlation_key text;          -- deterministic key the correlation was formed on

-- DLQ view: everything permanently failed, newest first.
create index if not exists notification_log_dead_idx on public.notification_log (dead_at desc) where status = 'dead';
-- Auto-retry worker: due, not-yet-dead failures.
create index if not exists notification_log_retry_due_idx on public.notification_log (next_retry_at) where status = 'failed' and next_retry_at is not null;
-- Correlation lookup + feed collapse.
create index if not exists notification_log_correlation_idx on public.notification_log (correlation_id);
create index if not exists notification_log_corrkey_idx on public.notification_log (correlation_key, created_at desc);
-- Cursor pagination keyset (created_at desc, id desc).
create index if not exists notification_log_cursor_idx on public.notification_log (created_at desc, id desc);
