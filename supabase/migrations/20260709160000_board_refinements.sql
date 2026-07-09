-- Board / Order refinements (review points 1–5, 10, 12). The only NEW state is
-- the cancellation reason taxonomy; Next-Action, Effective Priority, refund
-- sub-states, inventory states, work queues and metrics are all DERIVED at read
-- time from data the order already carries (+ the audit_events stream).

-- Commercial Cancellation (1): one flow, a typed reason. Keeps the workflow /
-- refund / email single-path while analytics can split by cause.
alter table public.orders add column if not exists cancellation_type varchar(20)
  check (cancellation_type in ('customer','warehouse_exception','fraud','admin'));

-- Extend cancel_order to persist the type (idempotent re-create).
create or replace function public.cancel_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o           public.orders%rowtype;
  v_prev      public.order_status;
  v_restocked integer := 0;
  r           record;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true, 'previous_status', o.status);
  end if;
  if o.status in ('shipped','delivered','returned','rto') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable', 'previous_status', o.status);
  end if;

  v_prev := o.status;

  update public.orders
     set status            = 'cancelled',
         cancelled_at       = now(),
         cancel_reason      = nullif(p->>'reason',''),
         cancellation_type  = nullif(p->>'cancellation_type',''),
         cancelled_by       = nullif(p->>'actor_id','')::uuid,
         updated_at         = now()
   where id = o.id;

  if coalesce((p->>'release_inventory')::boolean, false) then
    if o.payment_status <> 'pending' then
      for r in select variant_id, quantity from public.order_items
               where order_id = o.id and variant_id is not null loop
        update public.variants set stock = stock + r.quantity, updated_at = now()
         where id = r.variant_id;
        v_restocked := v_restocked + r.quantity;
      end loop;
    end if;
    delete from public.stock_reservations where order_id = o.id;
  end if;

  return jsonb_build_object('ok', true, 'already_cancelled', false,
                            'previous_status', v_prev, 'restocked', v_restocked);
end;
$$;

revoke all on function public.cancel_order(jsonb) from public, anon, authenticated;
grant execute on function public.cancel_order(jsonb) to service_role;
