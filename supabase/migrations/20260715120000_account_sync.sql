-- Cross-device account state — the customer's cart + wishlist follow them to any
-- device once signed in. Stored as jsonb (the exact client state) keyed by user, so
-- hydration needs no refetch. Loyalty points + order history already live on the user
-- (users.loyalty_points, orders.user_id), so those sync already.
--
-- Also captures the Google avatar on first sign-in (handle_new_user).

alter table public.users add column if not exists avatar_url text;

-- Re-create the profile trigger to also capture the OAuth avatar (Google → picture/
-- avatar_url). Name still coalesces full_name → name. Idempotent (on conflict do nothing).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table if not exists public.account_state (
  user_id    uuid primary key references public.users(id) on delete cascade,
  cart       jsonb not null default '[]'::jsonb,
  wishlist   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.account_state enable row level security;
grant all on public.account_state to service_role;
