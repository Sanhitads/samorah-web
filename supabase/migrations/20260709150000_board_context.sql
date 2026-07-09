-- Fulfillment Board context (SLP principles 11–17) — the triage metadata a
-- warehouse operator needs to answer "what do I work on next, and how careful
-- do I need to be". Priority + assignee + operational tags/notes are the only
-- NEW state; item count, payment badge, SLA age, gift notes and inventory status
-- are DERIVED at read time from data the order already carries.

-- Priority (12): drives the top-of-board ordering. VIP/Urgent jump the queue.
alter table public.orders add column if not exists priority varchar(10) not null default 'normal'
  check (priority in ('normal','high','urgent','vip'));

-- Assignee (11): which operator owns this order right now.
alter table public.orders add column if not exists assigned_to uuid references public.users(id) on delete set null;

-- Operational tags (13): the manual ones (Fragile/Express/Replacement/Wholesale).
-- Gift + COD are derived from is_gift / is_cod and never stored here.
alter table public.orders add column if not exists ops_tags text[] not null default '{}';

-- Warehouse note (15): internal handling note ("leave at reception", "call before").
alter table public.orders add column if not exists ops_note text;

create index if not exists orders_priority_idx    on public.orders (priority);
create index if not exists orders_assigned_to_idx on public.orders (assigned_to);
