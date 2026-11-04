-- ============================================================================
-- MANUFACTURING BATCH & TRACEABILITY — Phase 2: Core Schema & Security ONLY
-- ============================================================================
-- Forward migration (2026-11-04). ADDITIVE and backward-compatible. This phase
-- creates the manufacturing/traceability FOUNDATION: tables, constraints, unique
-- indexes, RLS, an isolated batch-code generator, and read-only helpers.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO (scoped by approval):
--   • It does NOT alter inventory_movements, variants.stock, or ANY stock-moving
--     RPC (apply_stock_movement / reserve_stock / finalize_order / cancel_order /
--     commit_receipt …). There is exactly ONE authoritative stock-posting path and
--     it is untouched. No new stock is ever posted by anything here (correction #1).
--   • It does NOT enable batch release, allocation, or any sellable-stock change.
--     batch_stock_entries / batch_release_events / batch_allocations are created
--     EMPTY; the RPCs that would write them belong to later, separately-approved
--     phases (6/7). Their presence here is schema only.
--   • It adds two additive, unread columns (products.batch_prefix,
--     variants.tracking_state) that change no behaviour (nothing reads them yet).
--
-- ACCOUNTING MODEL (correction #3). Four distinct record kinds, reconciled later:
--   1. inventory_movements  — THE authoritative aggregate stock ledger (untouched).
--   2. batch_stock_entries  — per-batch flow OVERLAY; each stock-affecting row
--      references the authoritative inventory_movements row (movement_id) it mirrors,
--      so Σ(entries.qty for a movement) MUST equal that movement's delta. Enforced by
--      the posting RPCs + a reconciliation helper + tests in Phase 6/7 (no posting now).
--   3. batch_allocations    — order→batch provenance (which batch fulfilled a line).
--   4. batch_quarantine     — recall / unknown-origin disposition.
--
-- CONVENTIONS: text + CHECK domains (mirrors inventory_movements.movement_type);
-- RLS Pattern #1 (enable RLS + grant to service_role; NO anon/authenticated policy);
-- SECURITY DEFINER functions pin `set search_path = ''` with fully-qualified names.
-- Proven locally with `supabase migration up` and `supabase db reset`. Forward-only.
-- DO NOT apply to production without separate approval.
-- ============================================================================

-- ── 0. Additive columns on existing tables (unread; no behaviour change) ──────
alter table public.products add column if not exists batch_prefix varchar(6);
-- Stable, immutable per-product short code for batch codes (e.g. 'KC'). UNIQUE when set.
create unique index if not exists products_batch_prefix_uidx on public.products(batch_prefix) where batch_prefix is not null;

alter table public.variants add column if not exists tracking_state text not null default 'untracked'
  check (tracking_state in ('untracked','tracked'));
alter table public.variants add column if not exists tracked_at timestamptz;
comment on column public.variants.tracking_state is
  'Phase-2 placeholder. A variant becomes ''tracked'' only AFTER an explicit legacy reconciliation (Phase 12). Unread until then.';


-- ── 1. Batch-code sequence (ISOLATED from the shared counters table) ──────────
-- counters.period is varchar(9) — too short for a (prefix-format-YYMMDD) scope key,
-- and batch codes must be isolated from order/invoice numbering. Dedicated table +
-- function, mirroring next_counter's proven atomic-upsert concurrency pattern.
create table if not exists public.batch_code_sequences (
  scope_key  text    primary key,          -- e.g. 'KC-G190-261201'
  last_seq   integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.batch_code_sequences enable row level security;
grant select, insert, update on public.batch_code_sequences to service_role;


-- ── 2. Materials & supplier-lot traceability (bidirectional) ──────────────────
create table if not exists public.materials (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  material_type text not null check (material_type in ('wax','fragrance','wick','vessel','packaging','dye','other')),
  default_uom   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, material_type)
);

create table if not exists public.material_lots (
  id                uuid primary key default gen_random_uuid(),
  material_id       uuid not null references public.materials(id) on delete restrict,
  supplier_name     text,                                   -- snapshot (preserved even if a supplier master changes later)
  supplier_lot_code text not null,                          -- immutable supplier/vendor lot identifier
  received_qty      numeric(14,3),
  uom               text,
  received_on       date,
  note              text,
  created_at        timestamptz not null default now(),
  unique (material_id, supplier_lot_code)
);
create index if not exists material_lots_lotcode_idx on public.material_lots(supplier_lot_code);  -- lot → batches reverse lookup


-- ── 3. Manufacturing batches (header) ─────────────────────────────────────────
-- Three ORTHOGONAL state dimensions (correction #7): lifecycle, recall_state, and a
-- DERIVED sellability (never stored). batch_kind separates real production from the
-- explicit legacy / quarantine containers (correction #2 — no invented batches).
create table if not exists public.manufacturing_batches (
  id                       uuid primary key default gen_random_uuid(),
  batch_kind               text not null default 'production' check (batch_kind in ('production','legacy','quarantine')),
  batch_code               text not null unique,                               -- immutable (trigger below)
  product_id               uuid references public.products(id) on delete restrict,
  variant_id               uuid not null references public.variants(id) on delete restrict,
  sku_snapshot             text not null,
  product_type             text,
  manufacturing_date       date,
  production_sequence       integer,
  lifecycle_status         text not null default 'draft'
                             check (lifecycle_status in ('draft','in_production','curing','quality_check','released','rejected','closed')),
  recall_state             text not null default 'none' check (recall_state in ('none','on_hold','recalled')),
  -- Production quantities (correction #4). All non-negative; conservation holds at EVERY lifecycle stage:
  --   produced = approved + rejected + qc_sampled_destroyed + pending_inspection
  -- (at draft/in_production all but pending are 0; QC moves pending → approved/rejected/sampled).
  planned_qty              integer not null default 0 check (planned_qty >= 0),
  produced_qty             integer not null default 0 check (produced_qty >= 0),
  pending_inspection_qty   integer not null default 0 check (pending_inspection_qty >= 0),
  approved_qty             integer not null default 0 check (approved_qty >= 0),
  rejected_qty             integer not null default 0 check (rejected_qty >= 0),
  qc_sampled_destroyed_qty integer not null default 0 check (qc_sampled_destroyed_qty >= 0),
  cure_start_date          date,
  earliest_release_date    date,
  production_started_at     timestamptz,
  production_completed_at   timestamptz,
  notes                    text,
  created_by               uuid references public.users(id) on delete set null,
  approved_by              uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint mfg_batches_qty_conservation
    check (produced_qty = approved_qty + rejected_qty + qc_sampled_destroyed_qty + pending_inspection_qty),
  -- A real production batch must carry production identity; legacy/quarantine containers need not.
  constraint mfg_batches_production_identity
    check (batch_kind <> 'production' or (product_id is not null and manufacturing_date is not null and production_sequence is not null))
);
create index if not exists mfg_batches_variant_idx on public.manufacturing_batches(variant_id, lifecycle_status);
create index if not exists mfg_batches_kind_idx    on public.manufacturing_batches(batch_kind);
create index if not exists mfg_batches_recall_idx  on public.manufacturing_batches(recall_state) where recall_state <> 'none';


-- ── 4. Candle manufacturing spec (1:1, candle-only) — formula REFERENCES ───────
-- Formula identity is stored as code+version references (and an optional immutable
-- snapshot) — protected recipes are NOT copied into broad admin rows (correction #8).
create table if not exists public.batch_candle_spec (
  batch_id                 uuid primary key references public.manufacturing_batches(id) on delete restrict,
  wax_formula_code         text,
  wax_formula_version      text,
  fragrance_formula_code   text,
  fragrance_formula_version text,
  wax_qty                  numeric(14,3),
  fragrance_qty            numeric(14,3),
  fragrance_load_pct       numeric(6,3),
  wick_spec                text,
  vessel_spec              text,
  fill_weight_target_g     numeric(10,2),
  fill_weight_actual_g     numeric(10,2),
  fragrance_add_temp_c     numeric(6,2),
  pour_temp_c              numeric(6,2),
  operator_id              uuid references public.users(id) on delete set null,
  deviations               text,
  formula_snapshot         jsonb,                              -- optional immutable snapshot (refs only, no secret recipe)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.batch_material_consumption (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.manufacturing_batches(id) on delete restrict,
  material_lot_id uuid not null references public.material_lots(id) on delete restrict,
  qty_consumed   numeric(14,3) not null check (qty_consumed > 0),
  uom            text,
  created_at     timestamptz not null default now(),
  unique (batch_id, material_lot_id)
);
create index if not exists batch_material_lot_idx on public.batch_material_consumption(material_lot_id);  -- lot → batches


-- ── 5. QC templates (versioned per product type / config) + QC records ────────
create table if not exists public.qc_templates (
  id              uuid primary key default gen_random_uuid(),
  product_type    text not null,
  variant_config  text not null default '',                 -- '' = applies to all configs of the type
  version         integer not null check (version >= 1),
  name            text,
  required_checks jsonb not null default '[]'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (product_type, variant_config, version)
);

create table if not exists public.batch_quality_checks (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references public.manufacturing_batches(id) on delete restrict,
  template_id          uuid references public.qc_templates(id) on delete set null,
  template_version     integer,
  check_type           text not null check (check_type in ('routine','design_validation')),
  sample_size          integer not null default 0 check (sample_size >= 0),
  sample_destroyed_qty integer not null default 0 check (sample_destroyed_qty >= 0),  -- destructive burn-test samples
  result               text check (result in ('pass','fail','conditional')),
  measurements         jsonb,
  criteria             jsonb,
  deviations           text,
  inspector_id         uuid references public.users(id) on delete set null,
  performed_at         timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists batch_qc_batch_idx on public.batch_quality_checks(batch_id);


-- ── 6. Status history (lifecycle + recall dimensions) ─────────────────────────
create table if not exists public.batch_status_history (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.manufacturing_batches(id) on delete restrict,
  dimension  text not null check (dimension in ('lifecycle','recall')),
  from_state text,
  to_state   text not null,
  reason     text,
  actor_id   uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists batch_status_hist_idx on public.batch_status_history(batch_id, created_at desc);


-- ── 7. Per-batch stock OVERLAY (append-only) — mirrors the authoritative ledger ─
-- Written ONLY by later-phase posting RPCs, each in the SAME txn as the single
-- authoritative inventory_movements posting it references (movement_id). Σ(qty for a
-- movement_id) must equal that movement's delta — reconciled by RPC + helper + tests.
-- EMPTY in Phase 2 (no posting path exists yet).
create table if not exists public.batch_stock_entries (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.manufacturing_batches(id) on delete restrict,
  variant_id      uuid not null references public.variants(id) on delete restrict,
  entry_type      text not null check (entry_type in
                     ('legacy_opening','release','sale','return_restock','cancel_restock',
                      'recall_out','recall_restore','substitution_in','substitution_out','writeoff',
                      'quarantine_out','quarantine_release')),
  qty             integer not null,                               -- signed; sign convention enforced by posting RPCs (Phase 6/7)
  movement_id     uuid references public.inventory_movements(id) on delete restrict,  -- the authoritative posting this mirrors
  source_type     text,
  source_id       uuid,
  reference       text,
  actor_id        uuid references public.users(id) on delete set null,
  metadata        jsonb,
  idempotency_key text,
  created_at      timestamptz not null default now()
);
create unique index if not exists batch_stock_entries_idem_idx on public.batch_stock_entries(idempotency_key) where idempotency_key is not null;
create index if not exists batch_stock_entries_batch_idx on public.batch_stock_entries(batch_id);
create index if not exists batch_stock_entries_variant_idx on public.batch_stock_entries(variant_id);
create index if not exists batch_stock_entries_movement_idx on public.batch_stock_entries(movement_id);


-- ── 8. Release events (correction #7: stable id + idempotency + DB-enforced cap) ─
create table if not exists public.batch_release_events (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.manufacturing_batches(id) on delete restrict,
  release_seq     integer not null check (release_seq >= 1),
  qty             integer not null check (qty > 0),
  movement_id     uuid references public.inventory_movements(id) on delete restrict,   -- set at posting (Phase 6)
  stock_entry_id  uuid references public.batch_stock_entries(id) on delete restrict,
  idempotency_key text not null unique,
  released_by     uuid references public.users(id) on delete set null,
  released_at     timestamptz not null default now(),
  unique (batch_id, release_seq)
);
create index if not exists batch_release_events_batch_idx on public.batch_release_events(batch_id);


-- ── 9. Order → batch allocations (provenance spine) ───────────────────────────
-- Keyed to order_item_id (+ variant). Compositions already create one order_item per
-- component, so this is component-level by construction; component_key reserves future
-- disambiguation for jsonb-bundle order lines sharing a variant (correction #6).
create table if not exists public.batch_allocations (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete restrict,
  order_item_id   uuid not null references public.order_items(id) on delete restrict,
  variant_id      uuid not null references public.variants(id) on delete restrict,
  component_key   text not null default '',
  batch_id        uuid not null references public.manufacturing_batches(id) on delete restrict,  -- legacy/quarantine are typed batches → never null
  qty             integer not null check (qty > 0),
  state           text not null default 'allocated' check (state in ('allocated','picked','shipped','returned','cancelled')),
  sale_movement_id uuid references public.inventory_movements(id) on delete restrict,
  allocated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (order_item_id, variant_id, batch_id, component_key)
);
create index if not exists batch_alloc_batch_idx on public.batch_allocations(batch_id);   -- recall → affected orders
create index if not exists batch_alloc_order_idx on public.batch_allocations(order_id);


-- ── 10. Quarantine disposition log (recall / unknown-origin) ──────────────────
create table if not exists public.batch_quarantine (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.manufacturing_batches(id) on delete restrict,
  variant_id     uuid not null references public.variants(id) on delete restrict,
  qty            integer not null check (qty > 0),
  reason         text,
  disposition    text not null default 'held' check (disposition in ('held','destroyed','released')),
  stock_entry_id uuid references public.batch_stock_entries(id) on delete restrict,
  actor_id       uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists batch_quarantine_batch_idx on public.batch_quarantine(batch_id);


-- ── 11. RLS Pattern #1 — service_role only; append-only where it mirrors a ledger ─
alter table public.materials                  enable row level security;
alter table public.material_lots              enable row level security;
alter table public.manufacturing_batches      enable row level security;
alter table public.batch_candle_spec          enable row level security;
alter table public.batch_material_consumption enable row level security;
alter table public.qc_templates               enable row level security;
alter table public.batch_quality_checks       enable row level security;
alter table public.batch_status_history       enable row level security;
alter table public.batch_stock_entries        enable row level security;
alter table public.batch_release_events        enable row level security;
alter table public.batch_allocations          enable row level security;
alter table public.batch_quarantine           enable row level security;

grant select, insert, update, delete on public.materials                  to service_role;
grant select, insert, update, delete on public.material_lots              to service_role;
grant select, insert, update, delete on public.manufacturing_batches      to service_role;
grant select, insert, update, delete on public.batch_candle_spec          to service_role;
grant select, insert, update, delete on public.batch_material_consumption to service_role;
grant select, insert, update, delete on public.qc_templates               to service_role;
grant select, insert, update, delete on public.batch_quality_checks       to service_role;
-- Append-only ledgers / history — no UPDATE/DELETE to any role (corrections mirror inventory_movements):
grant select, insert on public.batch_status_history to service_role;
grant select, insert on public.batch_stock_entries  to service_role;
grant select, insert on public.batch_release_events to service_role;
-- Allocations / quarantine evolve by state, so UPDATE is allowed; DELETE is not (traceability is permanent):
grant select, insert, update on public.batch_allocations to service_role;
grant select, insert, update on public.batch_quarantine  to service_role;


-- ── 12. Immutability + release-cap triggers ───────────────────────────────────
create or replace function public.tg_batch_code_immutable()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.batch_code is distinct from old.batch_code then
    raise exception 'manufacturing_batches.batch_code is immutable (% → %)', old.batch_code, new.batch_code
      using errcode = 'check_violation';
  end if;
  if new.batch_kind is distinct from old.batch_kind then
    raise exception 'manufacturing_batches.batch_kind is immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_batch_code_immutable on public.manufacturing_batches;
create trigger trg_batch_code_immutable before update on public.manufacturing_batches
  for each row execute function public.tg_batch_code_immutable();

-- DB-enforced release cap (correction #7): Σ release-event qty for a batch ≤ approved_qty.
-- Locks the batch row so concurrent release events cannot collectively exceed the cap.
create or replace function public.tg_batch_release_cap()
returns trigger language plpgsql
set search_path = ''
as $$
declare v_approved integer; v_sum integer;
begin
  select approved_qty into v_approved from public.manufacturing_batches where id = new.batch_id for update;
  if not found then
    raise exception 'batch_release_events: batch % not found', new.batch_id using errcode = 'foreign_key_violation';
  end if;
  select coalesce(sum(qty), 0) into v_sum from public.batch_release_events where batch_id = new.batch_id;
  if v_sum + new.qty > v_approved then
    raise exception 'batch_release_events: released %+% would exceed approved_qty % for batch %',
      v_sum, new.qty, v_approved, new.batch_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_batch_release_cap on public.batch_release_events;
create trigger trg_batch_release_cap before insert on public.batch_release_events
  for each row execute function public.tg_batch_release_cap();


-- ── 13. Batch-code generation (ISOLATED, concurrency-safe, NON-stock) ─────────
-- Pure format helper: FORMAT is derived from vessel + size (NOT the mutable SKU token).
create or replace function public.batch_format_code(p_vessel text, p_size_label text, p_product_type text)
returns text language sql immutable
set search_path = ''
as $$
  select case
    when p_product_type = 'room_spray'  then 'R'  || nullif(regexp_replace(coalesce(p_size_label,''), '[^0-9]', '', 'g'), '') || 'ML'
    when p_product_type = 'linen_spray' then 'LN' || nullif(regexp_replace(coalesce(p_size_label,''), '[^0-9]', '', 'g'), '') || 'ML'
    else upper(left(coalesce(nullif(p_vessel,''), substr(coalesce(p_product_type,'X'),1,1)), 1))
         || regexp_replace(coalesce(p_size_label,''), '[^0-9]', '', 'g')
  end;
$$;

-- Atomic sequence allocator (mirrors next_counter's upsert) for a (prefix-format-date) scope.
create or replace function public.next_batch_sequence(p_scope_key text)
returns integer language sql
security definer
set search_path = ''
as $$
  insert into public.batch_code_sequences (scope_key, last_seq)
  values (p_scope_key, 1)
  on conflict (scope_key)
  do update set last_seq = public.batch_code_sequences.last_seq + 1, updated_at = pg_catalog.now()
  returning last_seq;
$$;

-- Generate the NEXT code 'PREFIX-FORMAT-YYMMDD-SEQ'. Does NOT create a batch row (that is
-- create_batch, Phase 3). Concurrency-safe via next_batch_sequence. Cancelled batches never
-- recycle a sequence (the counter is monotonic per scope).
create or replace function public.generate_batch_code(p_prefix text, p_format text, p_date date)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare v_prefix text; v_format text; v_ymd text; v_scope text; v_seq integer;
begin
  v_prefix := upper(nullif(btrim(coalesce(p_prefix,'')), ''));
  v_format := upper(nullif(btrim(coalesce(p_format,'')), ''));
  if v_prefix is null or v_format is null or p_date is null then
    raise exception 'generate_batch_code: prefix, format and date are required' using errcode = 'invalid_parameter_value';
  end if;
  v_ymd   := to_char(p_date, 'YYMMDD');
  v_scope := v_prefix || '-' || v_format || '-' || v_ymd;
  v_seq   := public.next_batch_sequence(v_scope);
  return v_prefix || '-' || v_format || '-' || v_ymd || '-' || lpad(v_seq::text, 2, '0');
end $$;


-- ── 14. Read-only reconciliation helpers (NON-stock) ──────────────────────────
-- Per-batch on-hand = Σ overlay entries (0 in Phase 2). Used by later phases + tests.
create or replace function public.batch_onhand(p_batch_id uuid)
returns integer language sql stable
set search_path = ''
as $$
  select coalesce(sum(qty), 0)::integer from public.batch_stock_entries where batch_id = p_batch_id;
$$;

-- Conservation drift report for a variant: aggregate ledger stock vs the batch overlay.
-- In Phase 2 (no overlay rows) tracked_onhand = 0 and movement_attributed = 0 → drift 0.
-- In later phases: Σ(entries with a movement_id).qty MUST equal Σ(those movements).delta.
create or replace function public.variant_batch_reconciliation(p_variant_id uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'variant_id',          p_variant_id,
    'aggregate_stock',     (select coalesce(stock,0) from public.variants where id = p_variant_id),
    'tracked_onhand',      (select coalesce(sum(qty),0) from public.batch_stock_entries where variant_id = p_variant_id),
    'overlay_attributed',  (select coalesce(sum(qty),0) from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null),
    'ledger_attributed',   (select coalesce(sum(m.quantity_delta),0)
                              from public.inventory_movements m
                              where m.variant_ref = p_variant_id
                                and m.id in (select movement_id from public.batch_stock_entries where movement_id is not null)),
    'overlay_ledger_drift',(
       (select coalesce(sum(qty),0) from public.batch_stock_entries where variant_id = p_variant_id and movement_id is not null)
       - (select coalesce(sum(m.quantity_delta),0)
            from public.inventory_movements m
            where m.variant_ref = p_variant_id
              and m.id in (select movement_id from public.batch_stock_entries where movement_id is not null))
    )
  );
$$;


-- ── 15. Function grants (service_role only; never anon/authenticated) ─────────
revoke all on function public.next_batch_sequence(text)                         from public, anon, authenticated;
revoke all on function public.generate_batch_code(text, text, date)             from public, anon, authenticated;
revoke all on function public.batch_format_code(text, text, text)               from public, anon, authenticated;
revoke all on function public.batch_onhand(uuid)                                from public, anon, authenticated;
revoke all on function public.variant_batch_reconciliation(uuid)                from public, anon, authenticated;
grant execute on function public.next_batch_sequence(text)                      to service_role;
grant execute on function public.generate_batch_code(text, text, date)          to service_role;
grant execute on function public.batch_format_code(text, text, text)            to service_role;
grant execute on function public.batch_onhand(uuid)                             to service_role;
grant execute on function public.variant_batch_reconciliation(uuid)             to service_role;
