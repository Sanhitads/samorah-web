-- Warehouse routing (build #7 / coverage §G) — the one missing piece for multi-
-- warehouse: WHICH warehouse fulfils an order. `serves_states` lets a warehouse
-- claim a set of delivery states (empty = serves anywhere). The routing engine
-- prefers a warehouse that serves the delivery state, else the highest-priority
-- active one. Single-warehouse today still works (empty serves_states → default).

alter table public.warehouses add column if not exists serves_states text[] not null default '{}'::text[];
