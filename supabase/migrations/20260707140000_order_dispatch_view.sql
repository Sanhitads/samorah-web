-- Fulfilment convenience view — a flat pick-and-pack list per order that already
-- groups Discovery Composition members, so ops never reason about composition_id.
-- `group_key` collapses a composition into one logical unit; `line_type` labels it.
create or replace view public.order_dispatch_list as
select
  o.order_number,
  o.status,
  o.payment_status,
  o.ship_full_name,
  o.ship_phone,
  oi.order_id,
  case when oi.composition_id is not null then 'composition' else 'standalone' end as line_type,
  coalesce(oi.composition_id, oi.id::text) as group_key,
  oi.product_name,
  oi.sku,
  oi.vessel,
  oi.size,
  oi.quantity,
  oi.volume_label,
  oi.collection_name,
  oi.edition_label
from public.order_items oi
join public.orders o on o.id = oi.order_id;

grant select on public.order_dispatch_list to service_role;
