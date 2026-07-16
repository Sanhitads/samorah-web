-- Phase 16 — Notification Operations Enhancements. ADDITIVE only: the engine, routing model,
-- correlation model and existing columns are untouched; these are the storage bits the new
-- behaviours require.
--
--   • Deduplication  — repeated event+entity+severity inside a window collapse into ONE dispatch
--     carrying an occurrence counter. Every occurrence is still preserved (audit) in
--     notification_occurrences, so nothing is lost while Slack/email stay quiet.
--   • Rate limiting  — throttled dispatches are QUEUED (status 'queued' + next_retry_at) and drained
--     by the existing retry worker, so they are delayed, never dropped. Needs no new columns.
--   • Live feed      — notification_log has RLS enabled with NO policies, so a browser Realtime
--     subscription would receive nothing. Add a staff read policy + the realtime publication.

alter table public.notification_log
  add column if not exists dedup_key          text,          -- event + entity + severity signature
  add column if not exists occurrence_count   integer not null default 1,
  add column if not exists last_occurrence_at timestamptz;

-- Every suppressed repeat is preserved here (the audit trail the feed no longer has to show).
create table if not exists public.notification_occurrences (
  id               uuid primary key default gen_random_uuid(),
  leader_group_id  uuid not null,          -- the notification_log group that DID dispatch
  dedup_key        text not null,
  event            varchar(60) not null,
  severity         varchar(20) not null,
  entity_type      varchar(30),
  entity_ref       text,
  payload          jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists notification_occurrences_leader_idx on public.notification_occurrences (leader_group_id, created_at desc);
create index if not exists notification_occurrences_key_idx    on public.notification_occurrences (dedup_key, created_at desc);

-- Dedup lookup: newest leader for a signature inside the window.
create index if not exists notification_log_dedup_idx on public.notification_log (dedup_key, created_at desc) where dedup_key is not null;
-- Rate-limit counting + the worker draining queued dispatches.
create index if not exists notification_log_chan_recent_idx on public.notification_log (channel, created_at desc);
create index if not exists notification_log_queued_idx on public.notification_log (next_retry_at) where status = 'queued';

alter table public.notification_occurrences enable row level security;
grant all on public.notification_occurrences to service_role;

-- ── Live feed: staff may READ the log from the browser (writes stay service-role only) ──
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_log' and policyname = 'notification_log staff read') then
    create policy "notification_log staff read" on public.notification_log for select to authenticated using (public.is_editor());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_occurrences' and policyname = 'notification_occurrences staff read') then
    create policy "notification_occurrences staff read" on public.notification_occurrences for select to authenticated using (public.is_editor());
  end if;
end $$;

-- Realtime: publish notification_log so the Operations Center updates without a manual refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_log') then
      alter publication supabase_realtime add table public.notification_log;
    end if;
  end if;
end $$;
