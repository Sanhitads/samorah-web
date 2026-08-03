-- Coupon & Promotions Phase 1 — atomic, race-safe redemption lifecycle (points 4/8/9/10).
-- Additive: these RPCs are not yet called by the app (the create-order/finalize/cancel wiring lands in
-- the next step), so this migration changes NO behaviour. It establishes the correct primitives:
--
--  Lifecycle:  reserve (at checkout, before payment) → consume (on payment success)
--                                                     ↘ release (payment failed / cancel-before-fulfil)
--              consumed ─ release (cancel) / retain (refund — no-op) / restore (admin, +reason)
--
--  used_count is the fast operational counter and is mutated ATOMICALLY with the ledger in every RPC,
--  so the two never diverge: used_count == COUNT(redemptions WHERE state IN ('reserved','consumed',
--  'restored')). A reservation HOLDS the slot from checkout, so the global/per-customer limits are
--  enforced before payment (never-overcharge) and the final-slot race is decided by the coupon row lock.

-- 1) Ledger shape: add 'reserved' state; a reserved row has no consumed_at until it is consumed.
alter table public.coupon_redemptions add column if not exists reserved_at timestamptz not null default now();
alter table public.coupon_redemptions alter column consumed_at drop not null;
alter table public.coupon_redemptions alter column consumed_at drop default;
alter table public.coupon_redemptions drop constraint if exists coupon_redemptions_state_check;
alter table public.coupon_redemptions add constraint coupon_redemptions_state_check
  check (state in ('reserved', 'consumed', 'released', 'restored'));

-- One redemption row per order (idempotency for reserve/consume; restore reuses the same row). Non-partial
-- so ON CONFLICT (order_id) can infer it; NULL order_ids (after an order is purged) stay distinct.
create unique index if not exists coupon_redemptions_order_uniq
  on public.coupon_redemptions (order_id);

-- Slots currently HELD by a customer on a coupon (drives the per-customer cap check).
create index if not exists coupon_redemptions_held_idx
  on public.coupon_redemptions (coupon_id, identity) where state in ('reserved', 'consumed', 'restored');

-- 2) reserve_coupon — atomically hold a slot at checkout (before payment). Row-locks the coupon so
--    two simultaneous attempts on the final slot can never both succeed. Enforces global + per-customer
--    limits and the zero-benefit rule. Idempotent per order. Also stamps orders.coupon_id (snapshot link).
create or replace function public.reserve_coupon(
  p_order_id      uuid,
  p_coupon_code   text,
  p_identity      text,
  p_user_id       uuid,
  p_email         text,
  p_benefit_paise integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.coupons%rowtype;
  v_held   integer;
  v_ins    integer;
  v_state  text;
begin
  select * into c from public.coupons where code = upper(trim(p_coupon_code)) for update;
  if not found then return jsonb_build_object('reserved', false, 'reason', 'not_found'); end if;
  -- Idempotency FIRST: if this order already has a redemption row, return it WITHOUT re-checking limits
  -- (the order's own held slot must never count against its identity on a retry).
  select state into v_state from public.coupon_redemptions where order_id = p_order_id;
  if v_state is not null then
    return jsonb_build_object('reserved', v_state in ('reserved', 'consumed', 'restored'), 'already', true, 'coupon_id', c.id);
  end if;
  if coalesce(p_benefit_paise, 0) <= 0 then return jsonb_build_object('reserved', false, 'reason', 'no_benefit'); end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    return jsonb_build_object('reserved', false, 'reason', 'exhausted');
  end if;
  if c.max_uses_per_user is not null then
    select count(*) into v_held from public.coupon_redemptions
      where coupon_id = c.id and identity = p_identity and state in ('reserved', 'consumed', 'restored');
    if v_held >= c.max_uses_per_user then
      return jsonb_build_object('reserved', false, 'reason', 'per_user');
    end if;
  end if;

  insert into public.coupon_redemptions
    (coupon_id, coupon_code, order_id, user_id, email_normalized, identity, discount_paise, state, reserved_at)
    values (c.id, c.code, p_order_id, p_user_id, nullif(lower(trim(p_email)), ''), p_identity, p_benefit_paise, 'reserved', now())
    on conflict (order_id) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then
    return jsonb_build_object('reserved', true, 'already', true, 'coupon_id', c.id); -- already reserved for this order
  end if;

  update public.coupons set used_count = used_count + 1, updated_at = now() where id = c.id;
  update public.orders set coupon_id = c.id where id = p_order_id and coupon_id is null;
  return jsonb_build_object('reserved', true, 'coupon_id', c.id);
end;
$$;

-- 3) consume_coupon — payment succeeded: reserved → consumed (used_count unchanged; already held).
--    Idempotent: a second call (webhook retry) finds no 'reserved' row and no-ops.
create or replace function public.consume_coupon(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.coupon_redemptions set state = 'consumed', consumed_at = now(), updated_at = now()
    where order_id = p_order_id and state = 'reserved';
  get diagnostics v_n = row_count;
  return jsonb_build_object('consumed', v_n > 0);
end;
$$;

-- 4) release_coupon — free the slot (payment failed / abandoned / cancel-before-fulfilment). Decrements
--    used_count atomically. Idempotent: only a currently-held row is released. Reason + actor recorded.
create or replace function public.release_coupon(p_order_id uuid, p_reason text default null, p_actor_type text default 'system', p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid;
begin
  update public.coupon_redemptions
    set state = 'released', released_at = now(), reason = p_reason, actor_type = p_actor_type, actor_id = p_actor_id, updated_at = now()
    where order_id = p_order_id and state in ('reserved', 'consumed', 'restored')
    returning coupon_id into v_cid;
  if v_cid is null then return jsonb_build_object('released', false); end if;
  update public.coupons set used_count = greatest(0, used_count - 1), updated_at = now() where id = v_cid;
  return jsonb_build_object('released', true);
end;
$$;

-- 5) restore_coupon — admin manual restore of a released redemption (re-holds the slot). Reason MANDATORY.
create or replace function public.restore_coupon(p_order_id uuid, p_reason text, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid;
begin
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('restored', false, 'reason', 'reason_required'); end if;
  update public.coupon_redemptions
    set state = 'restored', released_at = null, reason = p_reason, actor_type = 'staff', actor_id = p_actor_id, updated_at = now()
    where order_id = p_order_id and state = 'released'
    returning coupon_id into v_cid;
  if v_cid is null then return jsonb_build_object('restored', false, 'reason', 'not_released'); end if;
  update public.coupons set used_count = used_count + 1, updated_at = now() where id = v_cid;
  return jsonb_build_object('restored', true);
end;
$$;

grant execute on function public.reserve_coupon(uuid, text, text, uuid, text, integer) to service_role;
grant execute on function public.consume_coupon(uuid) to service_role;
grant execute on function public.release_coupon(uuid, text, text, uuid) to service_role;
grant execute on function public.restore_coupon(uuid, text, uuid) to service_role;
