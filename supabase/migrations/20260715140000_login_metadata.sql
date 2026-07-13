-- Login metadata + history (review points 2, 5, 6, 8, 11). How a user authenticated,
-- whether their email is verified, when they last signed in, and a small login trail
-- for support + fraud. Captured on every sign-in by /api/account/login-event.

alter table public.users add column if not exists provider             varchar(20);
alter table public.users add column if not exists provider_id          text;
alter table public.users add column if not exists email_verified       boolean not null default false;
alter table public.users add column if not exists last_login_at        timestamptz;
alter table public.users add column if not exists last_login_provider  varchar(20);
alter table public.users add column if not exists onboarded            boolean not null default false;  -- first-login detection

create table if not exists public.login_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  provider   varchar(20),
  ip         text,
  user_agent text,
  device     text,     -- "Windows" / "macOS" / "iPhone" …
  browser    text,     -- "Chrome" / "Safari" …
  country    varchar(60),
  created_at timestamptz not null default now()
);
create index if not exists login_history_user_idx on public.login_history (user_id, created_at desc);

alter table public.login_history enable row level security;
grant all on public.login_history to service_role;
-- Users may read their OWN login history (session/activity list); writes are API-only.
drop policy if exists login_history_owner_read on public.login_history;
create policy login_history_owner_read on public.login_history for select to authenticated using (auth.uid() = user_id);
