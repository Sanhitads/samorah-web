-- ============================================================================
-- Phase 1B-0a — Payment / reservation window hardening (P0 correctness)
--
-- Phase 0/1A migrations (…16, …17) are FROZEN. This later migration CREATE-OR-REPLACEs
-- four live commerce RPCs so the canonical active definitions are explicit + last-wins.
--
--   1. payable_window_minutes()  — THE single source of truth for the payable-order deadline.
--   2. create_pending_order      — extend an order-linked hold's expires_at to the payable window
--                                  (Option B). Pre-order/cart holds keep their short 15-min TTL.
--   3. finalize_order            — transactional TERMINAL-STATE guard under the order row lock:
--                                  a late capture cannot resurrect a non-'pending' (cancelled) order.
--   4. expire_stale_pending_orders — use the canonical window (no second 30 constant).
--   5. begin_refund              — exactly-once per capture (payment_id dedup) + a controlled
--                                  late_payment mode so the compensation refund can be recorded
--                                  against an order our system already marked failed/cancelled.
--
-- No storefront behaviour change; no ledger/authority change (Phase 0/1A invariants preserved).
-- ============================================================================


-- ── 1. Canonical payable deadline — ONE source ───────────────────────────────
create or replace function public.payable_window_minutes()
returns integer language sql immutable set search_path = public
as $$ select 30 $$;   -- the single payable-order deadline; do not hardcode 30 elsewhere
comment on function public.payable_window_minutes() is
  'Canonical payable-order window (minutes). The ONLY source: consumed by create_pending_order (hold extension) and expire_stale_pending_orders (cancellation). Cart holds keep the separate 15-min reserve_stock TTL.';


-- ── 2. create_pending_order — extend order-linked holds to the payable window ─
-- (Full body reproduced from 20260707120000; only the hold-link block changes.)
create or replace function public.create_pending_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_year   text := to_char(now(), 'YYYY');
  v_seq    integer;
  v_number text;
  v_id     uuid;
  v_item   jsonb;
begin
  v_seq := public.next_counter('order', v_year);
  v_number := 'SAM-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  insert into public.orders (
    order_number, email, phone, status, payment_status, payment_method, coupon_code,
    subtotal, discount_amount, shipping_amount, total_amount,
    taxable_amount, cgst_amount, sgst_amount, igst_amount,
    ship_full_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode,
    internal_notes, razorpay_order_id, brand_name, commerce_version, tax_version, pricing_version,
    shipping_method, shipping_charge, shipping_gst, shipping_rate_version, cart_hash,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, placed_at
  ) values (
    v_number, p->>'email', p->>'phone', 'pending', 'pending', 'razorpay', nullif(p->>'coupon_code', ''),
    (p->>'subtotal')::numeric, (p->>'discount_amount')::numeric, (p->>'shipping_amount')::numeric, (p->>'total_amount')::numeric,
    (p->>'taxable_amount')::numeric, (p->>'cgst_amount')::numeric, (p->>'sgst_amount')::numeric, (p->>'igst_amount')::numeric,
    p->>'ship_full_name', p->>'ship_phone', p->>'ship_line1', nullif(p->>'ship_line2',''), p->>'ship_city', p->>'ship_state', p->>'ship_pincode',
    nullif(p->>'internal_notes',''), p->>'razorpay_order_id',
    nullif(p->>'brand_name',''), nullif(p->>'commerce_version',''), nullif(p->>'tax_version',''), nullif(p->>'pricing_version',''),
    nullif(p->>'shipping_method',''), (p->>'shipping_charge')::numeric, (p->>'shipping_gst')::numeric, nullif(p->>'shipping_rate_version',''),
    nullif(p->>'cart_hash',''),
    nullif(p->>'utm_source',''), nullif(p->>'utm_medium',''), nullif(p->>'utm_campaign',''), nullif(p->>'utm_content',''), nullif(p->>'utm_term',''),
    now()
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_name, sku, hsn_code, gst_rate,
      unit_price, quantity, line_subtotal, line_discount, line_taxable, line_cgst, line_sgst, line_igst, line_total,
      brand_name, collection_name, volume_label, edition_label, vessel, size, product_slug, image_url
    ) values (
      v_id, nullif(v_item->>'product_id','')::uuid, nullif(v_item->>'variant_id','')::uuid,
      v_item->>'product_name', nullif(v_item->>'variant_name',''), v_item->>'sku', v_item->>'hsn_code', (v_item->>'gst_rate')::integer,
      (v_item->>'unit_price')::numeric, (v_item->>'quantity')::integer,
      (v_item->>'line_subtotal')::numeric, (v_item->>'line_discount')::numeric, (v_item->>'line_taxable')::numeric,
      (v_item->>'line_cgst')::numeric, (v_item->>'line_sgst')::numeric, (v_item->>'line_igst')::numeric, (v_item->>'line_total')::numeric,
      nullif(v_item->>'brand_name',''), nullif(v_item->>'collection_name',''), nullif(v_item->>'volume_label',''),
      nullif(v_item->>'edition_label',''), nullif(v_item->>'vessel',''), nullif(v_item->>'size',''),
      nullif(v_item->>'product_slug',''), nullif(v_item->>'image_url','')
    );
  end loop;

  -- Link the cart holds to this order AND extend their lifetime to the canonical payable window
  -- (Option B / INV-11). greatest() never shortens an already-longer hold. So an order-linked hold
  -- stays counted by available_stock for the whole time the order can still be paid → no other buyer
  -- can take the unit; only genuinely abandoned (never-linked) cart holds expire at the short 15-min TTL.
  if nullif(p->>'reservation_session', '') is not null then
    update public.stock_reservations
      set order_id = v_id,
          expires_at = greatest(expires_at, now() + make_interval(mins => public.payable_window_minutes()))
      where session_id = p->>'reservation_session' and order_id is null;
  end if;

  return jsonb_build_object('order_id', v_id, 'order_number', v_number);
end $$;
revoke all on function public.create_pending_order(jsonb) from public, anon, authenticated;
grant  execute on function public.create_pending_order(jsonb) to service_role;


-- ── 3. finalize_order — transactional terminal-state guard ───────────────────
-- (Full body reproduced from 20260816120000; adds ONLY the terminal guard.)
create or replace function public.finalize_order(
  p_razorpay_order_id text, p_payment_id text, p_signature text, p_source text, p_amount_paise integer default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare o public.orders%rowtype; v_fy text; v_seq integer; v_invoice text; r record;
begin
  select * into o from public.orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- Already finalized (idempotent no-op).
  if o.idempotency_key is not null then
    return jsonb_build_object('found', true, 'created', false,
      'order_number', o.order_number, 'invoice_number', o.invoice_number, 'email', o.email);
  end if;

  -- TERMINAL-STATE GUARD (1B-0a). 'pending' is the ONLY finalizable-unpaid state. A never-finalized
  -- order (idempotency_key null) in any other status is terminal — today only 'cancelled', set by
  -- voidPendingOrder / cancel_order / expire_stale_pending_orders (all gate on payment_status='pending').
  -- Evaluated under this FOR UPDATE lock, serialized against expire_stale's `for update skip locked`, so
  -- the decision is authoritative: a late capture can NOT resurrect (no invoice / no stock / no fulfil).
  -- Compensation (deterministic auto-refund) is initiated by persistOrder from the returned `terminal`.
  if o.status <> 'pending' then
    return jsonb_build_object('found', true, 'created', false, 'terminal', true,
      'status', o.status::text, 'order_id', o.id, 'order_number', o.order_number,
      'total_amount', o.total_amount, 'email', o.email, 'razorpay_payment_id', p_payment_id);
  end if;

  -- Amount guard (defence-in-depth) — captured must equal the persisted total.
  if p_amount_paise is not null and round(o.total_amount * 100)::integer <> p_amount_paise then
    insert into public.audit_logs (action, entity_type, entity_id, after_data)
    values ('order_amount_mismatch', 'order', o.id,
            jsonb_build_object('expected_paise', round(o.total_amount * 100), 'got_paise', p_amount_paise, 'source', p_source));
    return jsonb_build_object('found', true, 'created', false, 'amount_mismatch', true, 'order_number', o.order_number);
  end if;

  v_fy := public.financial_year(now());
  v_seq := public.next_counter('invoice', v_fy);
  v_invoice := 'SAM/' || v_fy || '/' || lpad(v_seq::text, 6, '0');

  update public.orders set
    payment_status = 'paid', status = 'confirmed', razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature, idempotency_key = p_payment_id,
    invoice_number = v_invoice, invoice_date = current_date, updated_at = now()
  where id = o.id;

  for r in select variant_id, sum(quantity)::int as quantity
             from public.stock_reservations where order_id = o.id group by variant_id loop
    perform public.apply_stock_movement(
      r.variant_id, -r.quantity, 'sale', 'order', o.id, o.order_number,
      null, null, null, jsonb_build_object('payment_id', p_payment_id),
      'sale:' || o.id::text || ':' || r.variant_id::text);
  end loop;
  delete from public.stock_reservations where order_id = o.id;

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('order_paid', 'order', o.id,
          jsonb_build_object('source', p_source, 'payment_id', p_payment_id, 'invoice_number', v_invoice));

  return jsonb_build_object('found', true, 'created', true, 'source', p_source,
    'order_id', o.id, 'order_number', o.order_number, 'invoice_number', v_invoice, 'email', o.email);
end $$;
revoke all on function public.finalize_order(text, text, text, text, integer) from public, anon, authenticated;
grant  execute on function public.finalize_order(text, text, text, text, integer) to service_role;


-- ── 4. expire_stale_pending_orders — use the canonical window ────────────────
-- (Full body reproduced from 20260809170000; window now sourced from payable_window_minutes().)
create or replace function public.expire_stale_pending_orders(p_minutes int default null)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_cid uuid; v_win int := coalesce(p_minutes, public.payable_window_minutes()); n int := 0;
begin
  for v_id in
    select id from public.orders
      where payment_status = 'pending' and status = 'pending'
        and placed_at < now() - make_interval(mins => v_win)
      for update skip locked
  loop
    update public.orders set status = 'cancelled', payment_status = 'failed', updated_at = now() where id = v_id;
    delete from public.stock_reservations where order_id = v_id;
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
end $$;
revoke all on function public.expire_stale_pending_orders(int) from public, anon, authenticated;
grant  execute on function public.expire_stale_pending_orders(int) to service_role;


-- ── 5. begin_refund — exactly-once per capture + late_payment mode ───────────
-- (Full body reproduced from 20260709140000; adds payment_id dedup + late_payment mode.)
create or replace function public.begin_refund(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  o          public.orders%rowtype;
  v_amount   numeric(12,2) := (p->>'amount')::numeric;
  v_late     boolean       := coalesce((p->>'late_payment')::boolean, false);
  v_pay      text          := nullif(p->>'payment_id','');
  v_existing numeric(12,2);
  v_id       uuid;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Normal refunds require a paid order. A late_payment refund compensates a REAL gateway capture whose
  -- order our system already marked failed/cancelled (finalize was terminal-guarded) — the capture is
  -- authoritative at the gateway, so it is allowed but MUST carry the razorpay payment id.
  if v_late then
    if v_pay is null then return jsonb_build_object('ok', false, 'reason', 'late_payment_needs_payment_id'); end if;
  elsif o.payment_status = 'pending' or o.payment_status = 'failed' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- Exactly-once per LATE-PAYMENT capture (1B-0a): scoped to late_payment ONLY. A duplicate late-payment
  -- webhook / retry returns the existing non-failed obligation idempotently (order row-lock serialises).
  -- NOT applied to normal refunds: a paid order may legitimately have MANY partial refunds sharing the
  -- order's payment id — those are bounded by the over-refund guard below, never by this per-payment dedup.
  if v_late and v_pay is not null then
    select id into v_id from public.refunds
      where order_id = o.id and razorpay_payment_id = v_pay and status <> 'failed'
      order by created_at asc limit 1;
    if v_id is not null then
      return jsonb_build_object('ok', true, 'refund_id', v_id, 'idempotent', true);
    end if;
  end if;

  -- Over-refund guard — never refund more than the order total across non-failed refunds.
  select coalesce(sum(amount), 0) into v_existing
    from public.refunds where order_id = o.id and status <> 'failed';
  if v_existing + v_amount > o.total_amount then
    return jsonb_build_object('ok', false, 'reason', 'over_refund', 'already', v_existing, 'total', o.total_amount);
  end if;

  insert into public.refunds (order_id, razorpay_payment_id, amount, currency, status, method, reason, requested_by)
  values (o.id, v_pay, v_amount, coalesce(nullif(p->>'currency',''),'INR'),
          'initiated', coalesce(nullif(p->>'method',''),'gateway'), nullif(p->>'reason',''), nullif(p->>'actor_id','')::uuid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'refund_id', v_id);
end $$;
revoke all on function public.begin_refund(jsonb) from public, anon, authenticated;
grant  execute on function public.begin_refund(jsonb) to service_role;
