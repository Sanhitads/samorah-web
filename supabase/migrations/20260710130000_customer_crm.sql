-- CRM (Phase 3) — customer notes + tags for the Customer 360 view. Everything else
-- the CRM needs already exists: profile (users), orders (user_id), addresses,
-- returns, marketing_consent, loyalty. Segment (New/Repeat/VIP) is DERIVED from
-- order stats; these two columns are the only new manual state.

alter table public.users add column if not exists admin_notes text;
alter table public.users add column if not exists tags text[] not null default '{}';
