-- ============================================================================
-- MANUFACTURING — Phase 8 close-out (A.1 fingerprint, A.2 final dispatch gate). INERT, ADDITIVE.
-- ============================================================================
-- apply_stock_movement unchanged; variants.stock untouched. DO NOT activate/push/deploy.

-- ── A.1 collision-resistant pick fingerprint — md5 over the COMPLETE ordered pick state ──
-- Prior fingerprint (count:sum:max_ts) could collide for different batch sets sharing count/total/timestamp.
-- This hashes every active pick record's (order_item, batch, component, qty, record id), so ANY change to a
-- physical batch, quantity, substitution or added/reversed pick yields a different fingerprint → supersedes QC.
create or replace function public.order_pick_fingerprint(p_order_id uuid)
returns text language sql stable set search_path = '' as $$
  select md5(coalesce(string_agg(
           pc.order_item_id::text || '|' || pc.batch_id::text || '|' || pc.component_key || '|' ||
           pc.qty::text || '|' || pc.id::text, ';' order by pc.id), 'empty'))
  from public.batch_pick_confirmations pc where pc.order_id = p_order_id;
$$;

-- ── A.2 final carrier-dispatch gate — re-check at the LAST controllable boundary ──
-- A shipment created before a hold must NOT dispatch if a confirmed (frozen) batch is now recalled/held,
-- or the order became cancelled / fully-refunded. Untracked orders have no frozen lines → only the
-- order-level cancel/refund checks apply (unchanged outcomes for normal orders).
create or replace function public.assert_shipment_dispatchable(p_shipment_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_order uuid; v_bad uuid;
begin
  select order_id into v_order from public.shipments where id = p_shipment_id;
  if v_order is null then return jsonb_build_object('ok', false, 'reason', 'shipment_not_found'); end if;
  if (select status from public.orders where id = v_order) = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled'); end if;
  if (select payment_status from public.orders where id = v_order) = 'refunded' then
    return jsonb_build_object('ok', false, 'reason', 'fully_refunded'); end if;
  select sl.batch_id into v_bad from public.shipment_batch_lines sl
    join public.manufacturing_batches b on b.id = sl.batch_id
   where sl.shipment_id = p_shipment_id and b.recall_state <> 'none' limit 1;
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'reason', 'batch_recalled_or_held', 'batch_id', v_bad); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.order_pick_fingerprint(uuid)          from public, anon, authenticated;
revoke all on function public.assert_shipment_dispatchable(uuid)    from public, anon, authenticated;
grant  execute on function public.order_pick_fingerprint(uuid)      to service_role;
grant  execute on function public.assert_shipment_dispatchable(uuid) to service_role;
