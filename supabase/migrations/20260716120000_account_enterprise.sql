-- Enterprise account hardening (review points 2,3,7,8,9,10). New tables + columns;
-- no existing column changes (no regressions). Wiring lands in the services.

-- 3. Multi-provider auth — the source of truth for linked identities. users.provider
--    stays as the "last used" convenience. A new provider (Apple/MS) = a row here.
create table if not exists public.user_auth_providers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  provider    varchar(20) not null,          -- google | email | apple | …
  provider_id text,                          -- identity id from the provider
  email       text,
  linked_at   timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists user_auth_providers_user_idx on public.user_auth_providers (user_id);
alter table public.user_auth_providers enable row level security;
grant all on public.user_auth_providers to service_role;
drop policy if exists uap_owner_read on public.user_auth_providers;
create policy uap_owner_read on public.user_auth_providers for select to authenticated using (auth.uid() = user_id);

-- 9. Account audit trail — separate from analytics (product funnel) and audit_events
--    (staff/admin actions). This is the CUSTOMER's own account event history for CS +
--    compliance: login/logout/password/email/profile/address/wishlist/newsletter.
create table if not exists public.account_audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  event      varchar(40) not null,
  metadata   jsonb,
  ip_hash    text,                            -- hashed, never raw (point 10)
  created_at timestamptz not null default now()
);
create index if not exists account_audit_user_idx  on public.account_audit_log (user_id, created_at desc);
create index if not exists account_audit_purge_idx on public.account_audit_log (created_at);
alter table public.account_audit_log enable row level security;
grant all on public.account_audit_log to service_role;
drop policy if exists account_audit_owner_read on public.account_audit_log;
create policy account_audit_owner_read on public.account_audit_log for select to authenticated using (auth.uid() = user_id); -- export support

-- 2. Device management — one row per trusted device (stable client device_id).
create table if not exists public.user_devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  device_id      text not null,               -- stable id generated + kept client-side
  label          text,                        -- "Chrome on Windows" default; user-editable
  device         text,
  browser        text,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists user_devices_user_idx on public.user_devices (user_id, last_active_at desc);
alter table public.user_devices enable row level security;
grant all on public.user_devices to service_role;
drop policy if exists user_devices_owner on public.user_devices;
create policy user_devices_owner on public.user_devices for select to authenticated using (auth.uid() = user_id);

-- 7. Avatar abstraction — keep the provider URL (users.avatar_url) as fallback; a
--    future re-host job fills avatar_cached_url (e.g. Cloudinary). Schema-stable.
alter table public.users add column if not exists avatar_cached_url text;

-- 10. Privacy — store a HASH of the IP, never the raw value, going forward. Add a
--     device_id to correlate a login to a device. Retention index for purging.
alter table public.login_history add column if not exists ip_hash   text;
alter table public.login_history add column if not exists device_id text;
create index if not exists login_history_purge_idx on public.login_history (created_at);

-- 8. Deletion sync — tombstones so removals propagate across offline devices.
--    { cart: { <lineKey>: <deletedAtMs> }, wish: { <productId>: <deletedAtMs> } }
alter table public.account_state add column if not exists tombstones jsonb not null default '{}'::jsonb;
