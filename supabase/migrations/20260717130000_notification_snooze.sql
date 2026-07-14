-- Snooze support for operational alerts (review point 11). A snoozed alert item is hidden
-- from the Open view until `snoozed_until`, then reappears if still unresolved.
alter table public.notification_state
  add column if not exists snoozed_until timestamptz;

-- Structured context for event notifications (review point 8) — so events can carry the
-- same richness as operational alerts (company / contact / qty …) once producers emit it.
alter table public.admin_notifications
  add column if not exists metadata jsonb;
