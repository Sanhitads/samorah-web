-- ============================================================================
-- Returns Resolution Center (admin) — ADDITIVE, non-breaking.
--
-- Extends the existing `returns` table into a resolution workflow. All columns are
-- nullable / default-safe, so every existing return row stays valid and no existing
-- code path changes. Statuses stay CODE-enforced (src/lib/returns/state.ts) — this
-- migration adds no status check, matching the current design.
--
-- Mirrors the orders/fulfillment additive pattern: guarded named checks in a do$$
-- block, actor+timestamp pairs, comment on column. Idempotent (IF NOT EXISTS).
-- ============================================================================

alter table public.returns
  -- Phase 1: the resolution decision (drives waive-vs-RMA) + who/when.
  add column if not exists resolution varchar(20),
  add column if not exists resolution_by uuid references public.users(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  -- Phase 7: customer-facing message (returns.notes stays the INTERNAL note).
  add column if not exists customer_message text,
  -- Phase 5: inspection result + note + who/when.
  add column if not exists inspection_result varchar(20),
  add column if not exists inspection_note text,
  add column if not exists inspection_by uuid references public.users(id) on delete set null,
  add column if not exists inspected_at timestamptz,
  -- Phase 6: warehouse disposition + who/when.
  add column if not exists warehouse_decision varchar(20),
  add column if not exists warehouse_decision_by uuid references public.users(id) on delete set null,
  add column if not exists warehouse_decided_at timestamptz,
  -- Phase 8: internal damage grade (reporting only; never drives logic).
  add column if not exists damage_classification varchar(10),
  -- Phase 9: refund method chosen for the return (original functional; others structural).
  add column if not exists refund_method varchar(20);

-- Value guards — added separately + guarded so re-runs don't error.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'returns_resolution_check') then
    alter table public.returns add constraint returns_resolution_check
      check (resolution is null or resolution in ('return_required','return_waived','replacement_only','refund_only','partial_refund','exchange','reject_claim'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'returns_inspection_result_check') then
    alter table public.returns add constraint returns_inspection_result_check
      check (inspection_result is null or inspection_result in ('passed','failed','partial_damage'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'returns_warehouse_decision_check') then
    alter table public.returns add constraint returns_warehouse_decision_check
      check (warehouse_decision is null or warehouse_decision in ('restock','destroy','return_to_vendor','keep_as_sample'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'returns_damage_classification_check') then
    alter table public.returns add constraint returns_damage_classification_check
      check (damage_classification is null or damage_classification in ('minor','moderate','major'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'returns_refund_method_check') then
    alter table public.returns add constraint returns_refund_method_check
      check (refund_method is null or refund_method in ('original','store_credit','manual'));
  end if;
end $$;

create index if not exists idx_returns_resolution on public.returns (resolution) where resolution is not null;

comment on column public.returns.resolution is 'Admin resolution: return_required|return_waived|replacement_only|refund_only|partial_refund|exchange|reject_claim.';
comment on column public.returns.customer_message is 'Customer-facing message; returns.notes remains the internal note (never customer-visible).';
comment on column public.returns.inspection_result is 'passed|failed|partial_damage (post-receipt inspection).';
comment on column public.returns.warehouse_decision is 'restock|destroy|return_to_vendor|keep_as_sample (post-inspection disposition).';
comment on column public.returns.damage_classification is 'minor|moderate|major — internal reporting only, never drives logic.';
comment on column public.returns.refund_method is 'original|store_credit|manual. original is functional; store_credit is disabled (needs ledger); manual is structural.';

-- Phase 2: customer evidence — reuses Cloudinary (url + public_id), like the rest of the app.
-- CS attaches the photos/video a customer emails in (source='admin'); the post-launch customer
-- portal will write to the SAME table with source='customer'. No parallel store.
create table if not exists public.return_attachments (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  kind varchar(10) not null default 'image' check (kind in ('image','video')),
  url text not null,
  public_id varchar(200),
  caption varchar(200),
  uploaded_by uuid references public.users(id) on delete set null,
  source varchar(20) not null default 'admin' check (source in ('admin','customer')),
  created_at timestamptz not null default now()
);
create index if not exists idx_return_attachments_return on public.return_attachments (return_id);
alter table public.return_attachments enable row level security;
-- Service-role (admin server) manages these; no anon/authenticated policy → default deny for clients.
comment on table public.return_attachments is 'Customer return evidence (images/video), Cloudinary-backed. source: admin (CS-attached) | customer (portal, later).';
