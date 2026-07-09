-- Shipment Management (build order #4) — the post-dispatch lifecycle + proof of
-- delivery. The shipments/shipment_events tables + state machine already exist;
-- this adds the outcome fields an operator (or a courier webhook) records:
--   • delivery: delivered_at + who received it (POD)
--   • exception: the NDR reason (customer unavailable, address issue, damage…)
--   • rto / cancel: timestamps for the terminal exits
-- Customer-facing status stays DERIVED (toCustomerStatus) — never stored twice.

alter table public.shipments add column if not exists delivered_at     timestamptz;
alter table public.shipments add column if not exists delivered_to     varchar(160);   -- POD: recipient name
alter table public.shipments add column if not exists pod_note         text;           -- POD: note / signature ref
alter table public.shipments add column if not exists exception_reason varchar(240);
alter table public.shipments add column if not exists rto_at           timestamptz;
alter table public.shipments add column if not exists cancelled_at     timestamptz;

-- Look up a shipment by AWB for the courier webhook (couriers key on AWB).
create index if not exists shipments_awb_idx on public.shipments (awb);
