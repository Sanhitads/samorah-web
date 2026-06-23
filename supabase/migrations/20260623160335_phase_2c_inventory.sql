-- ============================================================================
-- Phase 2C — Inventory holds + webhook observability
--
-- Tables:  stock_reservations (-> variants/users/orders),  webhook_logs (-> orders)
-- Functions:
--   available_stock(variant_id)        -> stock minus active reservations
--   release_expired_reservations()     -> deletes expired holds (pg_cron, Phase 11)
--
-- Both tables are SERVER-managed (no client access). Public pages read available
-- stock only through the SECURITY DEFINER available_stock() function, so the
-- reservations table itself is never exposed.
-- ============================================================================


-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.webhook_status as enum ('received', 'processed', 'failed', 'duplicate');


-- ── stock_reservations (15-minute checkout hold, USD P7) ───────────────────────
create table public.stock_reservations (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.variants(id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  session_id varchar(255),                                       -- guest checkout session
  user_id    uuid references public.users(id)  on delete cascade,
  order_id   uuid references public.orders(id) on delete cascade, -- set once the order row exists
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- a hold must belong to a guest session or a user
  constraint stock_reservations_owner_present check (session_id is not null or user_id is not null)
);

create index stock_reservations_variant_active_idx on public.stock_reservations(variant_id, expires_at);
create index stock_reservations_expires_at_idx     on public.stock_reservations(expires_at);
create index stock_reservations_session_id_idx     on public.stock_reservations(session_id);
create index stock_reservations_user_id_idx        on public.stock_reservations(user_id);


-- available = variants.stock − Σ(active reservations). SECURITY DEFINER so public
-- pages can read it without any grant on the reservations table itself.
create or replace function public.available_stock(p_variant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce((select stock from public.variants where id = p_variant_id), 0)
    - coalesce((
        select sum(quantity)::int
        from public.stock_reservations
        where variant_id = p_variant_id and expires_at > now()
      ), 0)
  );
$$;

-- Safety-net cleanup of expired holds (pg_cron will call this every few minutes
-- in Phase 11). Returns the number of reservations released.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer;
begin
  with deleted as (
    delete from public.stock_reservations where expires_at <= now() returning 1
  )
  select count(*) into released from deleted;
  return released;
end;
$$;


-- ── webhook_logs (Razorpay / Shiprocket observability, USD S7) ─────────────────
create table public.webhook_logs (
  id            uuid primary key default gen_random_uuid(),
  provider      varchar(50)  not null,                            -- 'razorpay' | 'shiprocket' | ...
  event_type    varchar(100) not null,                            -- 'payment.captured', 'ndr.update', ...
  event_id      varchar(255),                                     -- provider event/payment id (dedup)
  order_id      uuid references public.orders(id) on delete set null,
  payload       jsonb        not null,
  status        public.webhook_status not null default 'received',
  error_message text,
  retry_count   integer      not null default 0 check (retry_count >= 0),
  processed_at  timestamptz,
  created_at    timestamptz  not null default now()
);

create index webhook_logs_provider_idx   on public.webhook_logs(provider);
create index webhook_logs_status_idx      on public.webhook_logs(status);
create index webhook_logs_event_id_idx    on public.webhook_logs(event_id);
create index webhook_logs_order_id_idx    on public.webhook_logs(order_id);
create index webhook_logs_created_at_idx  on public.webhook_logs(created_at desc);


-- ============================================================================
-- Row-Level Security — both tables are server-only (no client policies).
-- ============================================================================
alter table public.stock_reservations enable row level security;
alter table public.webhook_logs       enable row level security;


-- ============================================================================
-- Grants
-- ============================================================================
grant all on public.stock_reservations to service_role;
grant all on public.webhook_logs       to service_role;

-- available_stock is read by public storefront pages; release_* is server-only.
revoke execute on function public.available_stock(uuid)            from public;
revoke execute on function public.release_expired_reservations()   from public;
grant  execute on function public.available_stock(uuid)            to anon, authenticated, service_role;
grant  execute on function public.release_expired_reservations()   to service_role;
