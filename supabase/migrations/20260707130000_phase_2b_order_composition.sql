-- Phase 2B — group Discovery Composition purchases on the order. Adds a
-- composition_id snapshot to order_items so the confirmation page / invoice / admin
-- can render a curated set (vessel edition + N candles) instead of loose lines.

alter table public.order_items add column if not exists composition_id varchar(80);

create or replace function public.create_pending_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    order_number, email, phone,
    status, payment_status, payment_method,
    coupon_code,
    subtotal, discount_amount, shipping_amount, total_amount,
    taxable_amount, cgst_amount, sgst_amount, igst_amount,
    ship_full_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode,
    internal_notes,
    razorpay_order_id,
    brand_name, commerce_version, tax_version, pricing_version,
    shipping_method, shipping_charge, shipping_gst, shipping_rate_version,
    cart_hash,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    placed_at
  ) values (
    v_number, p->>'email', p->>'phone',
    'pending', 'pending', 'razorpay',
    nullif(p->>'coupon_code', ''),
    (p->>'subtotal')::numeric, (p->>'discount_amount')::numeric, (p->>'shipping_amount')::numeric, (p->>'total_amount')::numeric,
    (p->>'taxable_amount')::numeric, (p->>'cgst_amount')::numeric, (p->>'sgst_amount')::numeric, (p->>'igst_amount')::numeric,
    p->>'ship_full_name', p->>'ship_phone', p->>'ship_line1', nullif(p->>'ship_line2',''), p->>'ship_city', p->>'ship_state', p->>'ship_pincode',
    nullif(p->>'internal_notes',''),
    p->>'razorpay_order_id',
    nullif(p->>'brand_name',''), nullif(p->>'commerce_version',''), nullif(p->>'tax_version',''), nullif(p->>'pricing_version',''),
    nullif(p->>'shipping_method',''), (p->>'shipping_charge')::numeric, (p->>'shipping_gst')::numeric, nullif(p->>'shipping_rate_version',''),
    nullif(p->>'cart_hash',''),
    nullif(p->>'utm_source',''), nullif(p->>'utm_medium',''), nullif(p->>'utm_campaign',''), nullif(p->>'utm_content',''), nullif(p->>'utm_term',''),
    now()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, variant_name, sku, hsn_code, gst_rate,
      unit_price, quantity,
      line_subtotal, line_discount, line_taxable, line_cgst, line_sgst, line_igst, line_total,
      brand_name, collection_name, volume_label, edition_label, vessel, size, product_slug, image_url,
      composition_id
    ) values (
      v_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'variant_id','')::uuid,
      v_item->>'product_name', nullif(v_item->>'variant_name',''), v_item->>'sku', v_item->>'hsn_code', (v_item->>'gst_rate')::integer,
      (v_item->>'unit_price')::numeric, (v_item->>'quantity')::integer,
      (v_item->>'line_subtotal')::numeric, (v_item->>'line_discount')::numeric, (v_item->>'line_taxable')::numeric,
      (v_item->>'line_cgst')::numeric, (v_item->>'line_sgst')::numeric, (v_item->>'line_igst')::numeric, (v_item->>'line_total')::numeric,
      nullif(v_item->>'brand_name',''), nullif(v_item->>'collection_name',''), nullif(v_item->>'volume_label',''),
      nullif(v_item->>'edition_label',''), nullif(v_item->>'vessel',''), nullif(v_item->>'size',''),
      nullif(v_item->>'product_slug',''), nullif(v_item->>'image_url',''),
      nullif(v_item->>'composition_id','')
    );
  end loop;

  -- Link the stock holds made at reserve time to this order (consumed on finalize).
  if nullif(p->>'reservation_session', '') is not null then
    update public.stock_reservations
      set order_id = v_id
      where session_id = p->>'reservation_session' and order_id is null;
  end if;

  return jsonb_build_object('order_id', v_id, 'order_number', v_number);
end;
$$;
