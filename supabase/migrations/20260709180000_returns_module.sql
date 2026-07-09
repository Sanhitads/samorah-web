-- Returns Module (review point 9) — the integrative business module. The returns /
-- return_events tables + state machine already exist (slp_operational); this adds
-- the ties that make Returns connect the other modules:
--   • return_items  → which lines come back, how many, and whether to restock
--     (inventory tie)
--   • return_type   → refund | replacement | exchange
--   • refund_id     → the ledger row created when the return is refunded (payments tie)
--   • created_by    → actor attribution
-- Reverse shipping + notifications hook in via the shipment + notification engines.

alter table public.returns add column if not exists return_type varchar(20) not null default 'refund'
  check (return_type in ('refund','replacement','exchange'));
alter table public.returns add column if not exists refund_id  uuid references public.refunds(id) on delete set null;
alter table public.returns add column if not exists created_by uuid references public.users(id) on delete set null;

create table if not exists public.return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.returns(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  variant_id    uuid references public.variants(id) on delete set null,
  sku           varchar(60),
  product_name  varchar(200),
  quantity      integer not null check (quantity > 0),
  line_amount   numeric(12,2) not null default 0,   -- refundable value of this line
  restock       boolean not null default true,       -- back to sellable stock on refund?
  created_at    timestamptz not null default now()
);

create index if not exists return_items_return_idx on public.return_items (return_id);

alter table public.return_items enable row level security;
grant all on public.return_items to service_role;

-- restock_return_items(return_id) — increments sellable stock for the flagged lines.
-- Idempotent by design: the service calls it exactly once, on entry to 'refund'.
create or replace function public.restock_return_items(p_return_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_total integer := 0;
begin
  for r in select variant_id, quantity from public.return_items
           where return_id = p_return_id and restock = true and variant_id is not null loop
    update public.variants set stock = stock + r.quantity, updated_at = now() where id = r.variant_id;
    v_total := v_total + r.quantity;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.restock_return_items(uuid) from public, anon, authenticated;
grant execute on function public.restock_return_items(uuid) to service_role;
