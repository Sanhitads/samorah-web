-- Fulfillment Hold — remember the reason (optional) and the exact prior state so
-- Resume returns the order to where it was.
alter table public.orders
  add column if not exists fulfillment_hold_reason varchar(200),
  add column if not exists fulfillment_prev_status varchar(30);
