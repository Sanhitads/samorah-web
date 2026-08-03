-- Coupon Phase 1 (extension) — allow MULTIPLE coupons per order in the ledger, so a free-shipping coupon
-- that stacks with a discount coupon is tracked too. Idempotency + lifecycle move from (order_id) to
-- (order_id, coupon_id). release/restore now handle every held row on the order (each coupon's used_count
-- moves in lock-step). consume already keyed on order_id (state flip only) — no change needed there.

-- One redemption per (order, coupon) — was per (order). NULL coupon_id (coupon deleted) stays distinct.
drop index if exists public.coupon_redemptions_order_uniq;
create unique index if not exists coupon_redemptions_order_coupon_uniq
  on public.coupon_redemptions (order_id, coupon_id);

-- reserve_coupon — idempotent per (order, coupon); ON CONFLICT on the new key.
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
  select state into v_state from public.coupon_redemptions where order_id = p_order_id and coupon_id = c.id;
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
    on conflict (order_id, coupon_id) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return jsonb_build_object('reserved', true, 'already', true, 'coupon_id', c.id); end if;

  update public.coupons set used_count = used_count + 1, updated_at = now() where id = c.id;
  update public.orders set coupon_id = c.id where id = p_order_id and coupon_id is null;
  return jsonb_build_object('reserved', true, 'coupon_id', c.id);
end;
$$;

-- release_coupon — free EVERY held slot on the order; decrement each coupon's used_count.
create or replace function public.release_coupon(p_order_id uuid, p_reason text default null, p_actor_type text default 'system', p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid; v_any boolean := false;
begin
  for v_cid in
    select coupon_id from public.coupon_redemptions
      where order_id = p_order_id and state in ('reserved', 'consumed', 'restored')
  loop
    if v_cid is not null then
      update public.coupons set used_count = greatest(0, used_count - 1), updated_at = now() where id = v_cid;
    end if;
    v_any := true;
  end loop;
  update public.coupon_redemptions
    set state = 'released', released_at = now(), reason = p_reason, actor_type = p_actor_type, actor_id = p_actor_id, updated_at = now()
    where order_id = p_order_id and state in ('reserved', 'consumed', 'restored');
  return jsonb_build_object('released', v_any);
end;
$$;

-- restore_coupon — re-hold EVERY released slot on the order; increment each coupon's used_count.
create or replace function public.restore_coupon(p_order_id uuid, p_reason text, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid; v_any boolean := false;
begin
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('restored', false, 'reason', 'reason_required'); end if;
  for v_cid in
    select coupon_id from public.coupon_redemptions where order_id = p_order_id and state = 'released'
  loop
    if v_cid is not null then
      update public.coupons set used_count = used_count + 1, updated_at = now() where id = v_cid;
    end if;
    v_any := true;
  end loop;
  if not v_any then return jsonb_build_object('restored', false, 'reason', 'not_released'); end if;
  update public.coupon_redemptions
    set state = 'restored', released_at = null, reason = p_reason, actor_type = 'staff', actor_id = p_actor_id, updated_at = now()
    where order_id = p_order_id and state = 'released';
  return jsonb_build_object('restored', true);
end;
$$;
