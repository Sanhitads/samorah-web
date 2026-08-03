-- Coupon Phase 1 — release reserved coupon slots when a stale PENDING order expires (payment abandoned).
-- A coupon slot is HELD from checkout (reserve_coupon). If the customer never pays, the cron that cancels
-- stale pending orders must also free the coupon slot, exactly like it frees the stock holds — otherwise
-- an abandoned checkout would permanently consume a slot. Mirrors release_coupon (state → released,
-- used_count -= 1), atomically in the same loop iteration.
create or replace function public.expire_stale_pending_orders(p_minutes int default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_cid uuid;
  n     int := 0;
begin
  for v_id in
    select id from public.orders
      where payment_status = 'pending' and status = 'pending'
        and placed_at < now() - make_interval(mins => p_minutes)
      for update skip locked
  loop
    update public.orders set status = 'cancelled', payment_status = 'failed', updated_at = now() where id = v_id;
    delete from public.stock_reservations where order_id = v_id;

    -- Free the held coupon slot (payment abandoned).
    v_cid := null;
    update public.coupon_redemptions
      set state = 'released', released_at = now(), reason = 'pending order expired', actor_type = 'system', updated_at = now()
      where order_id = v_id and state in ('reserved', 'consumed', 'restored')
      returning coupon_id into v_cid;
    if v_cid is not null then
      update public.coupons set used_count = greatest(0, used_count - 1), updated_at = now() where id = v_cid;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.expire_stale_pending_orders(int) from public, anon, authenticated;
grant  execute on function public.expire_stale_pending_orders(int) to service_role;
