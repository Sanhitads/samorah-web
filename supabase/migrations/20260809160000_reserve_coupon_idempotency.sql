-- Fix: reserve_coupon must check per-order idempotency BEFORE the per-customer limit, otherwise a retry
-- for the same order is wrongly blocked as 'per_user' (the order's own held slot counts against its
-- identity). Recreate the function with the idempotency short-circuit first. (Original file corrected too.)
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
  if v_ins = 0 then return jsonb_build_object('reserved', true, 'already', true, 'coupon_id', c.id); end if;

  update public.coupons set used_count = used_count + 1, updated_at = now() where id = c.id;
  update public.orders set coupon_id = c.id where id = p_order_id and coupon_id is null;
  return jsonb_build_object('reserved', true, 'coupon_id', c.id);
end;
$$;
