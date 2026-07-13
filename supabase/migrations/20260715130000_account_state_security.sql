-- account_state hardening (review point 12.3) + preferences seam (point 4).
--
-- RLS owner policy: a user may read/write ONLY their own row. (The sync API already
-- gates by the verified session + admin client, but this is defence-in-depth and lets
-- a future authenticated client read its own state directly and nothing else.)
-- service_role keeps full access (the API path).

drop policy if exists account_state_owner on public.account_state;
create policy account_state_owner on public.account_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Preferences seam (point 4) — recentlyViewed, currency, sortPreference, savedFilters,
-- preferredCollection, lastSeenAnnouncements… stored as one jsonb, wired per feature later.
alter table public.account_state add column if not exists prefs jsonb not null default '{}'::jsonb;
