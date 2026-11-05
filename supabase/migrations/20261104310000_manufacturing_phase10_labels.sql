-- ============================================================================
-- MANUFACTURING — Phase 10: batch labels, product identification & print verification
-- ============================================================================
-- INERT; apply_stock_movement unchanged; a label print NEVER changes QC, inventory, lifecycle or recall
-- state. ADDITIVE. Uses the EXISTING immutable server-generated batch_code (never regenerated at print).
-- Retail/product labels are refused for a draft/curing/quality_check/qc_failed/rejected/held/recalled batch
-- (a non-released batch must never be presented as approved/sellable). Legal fields are reported as
-- verified / missing-business / missing-legal / optional — never fabricated. DO NOT activate/push/deploy or
-- perform real commercial printing.
-- ============================================================================

-- ── Versioned, controlled print templates ───────────────────────────────────
create table if not exists public.label_templates (
  id              uuid primary key default gen_random_uuid(),
  template_key    text not null,
  version         integer not null default 1,
  purpose         text not null check (purpose in ('internal_mfg','product_batch_id','retail')),
  title           text not null,
  -- dimensions are PLACEHOLDER until physically verified (Part B.5): never assumed as correct.
  dimensions      jsonb not null default '{}'::jsonb,       -- {w_mm,h_mm}
  dimensions_status text not null default 'unverified' check (dimensions_status in ('unverified','verified')),
  fields          jsonb not null default '[]'::jsonb,        -- ordered field keys the layout renders
  active          boolean not null default true,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (template_key, version)
);
alter table public.label_templates enable row level security;
grant select, insert, update on public.label_templates to service_role;

-- ── Append-only print history (a print is an audit event, not a state change) ──
create table if not exists public.label_print_jobs (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.manufacturing_batches(id) on delete restrict,
  variant_id       uuid references public.variants(id) on delete set null,
  template_id      uuid not null references public.label_templates(id) on delete restrict,
  template_key     text not null,
  template_version integer not null,
  purpose          text not null,
  batch_code       text not null,                            -- snapshot of the immutable code printed
  quantity         integer not null check (quantity > 0),
  data_snapshot    jsonb not null,                           -- the exact payload rendered (reproducible)
  printed_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists lpj_batch_idx on public.label_print_jobs(batch_id, created_at desc);
alter table public.label_print_jobs enable row level security;
grant select, insert on public.label_print_jobs to service_role;   -- append-only

-- ── Authoritative label payload + legal-field completeness audit (no fabrication) ──
create or replace function public.batch_label_payload(p_batch_id uuid, p_purpose text)
returns jsonb language sql stable set search_path = '' as $$
  with b as (select mb.*, v.sku, v.vessel_type, v.size_label, v.variant_name, p.name as product_name, p.hsn_code
             from public.manufacturing_batches mb
             join public.variants v on v.id = mb.variant_id
             join public.products p on p.id = v.product_id
             where mb.id = p_batch_id)
  select jsonb_build_object(
    'batch_id', (select id from b), 'purpose', p_purpose,
    'verified', jsonb_build_object(            -- authoritative current DB values (safe to print)
      'batch_code', (select batch_code from b),           -- immutable, server-generated — NEVER regenerated
      'product_name', (select product_name from b), 'variant', (select variant_name from b),
      'sku', (select sku from b), 'vessel', (select vessel_type from b), 'net_quantity', (select size_label from b),
      'hsn_code', (select hsn_code from b), 'manufacturing_date', (select manufacturing_date from b),
      'lifecycle_status', (select lifecycle_status from b), 'recall_state', (select recall_state from b)),
    -- fields REQUIRED on India retail packaging that are NOT in the DB → must be supplied/approved, not invented
    'missing_business', case when p_purpose = 'retail' then jsonb_build_array(
      'manufacturer_name_and_address','packer_importer_name_and_address','consumer_care_contact','mrp_inclusive_of_taxes') else '[]'::jsonb end,
    'missing_legal', case when p_purpose = 'retail' then jsonb_build_array(
      'country_of_origin','net_quantity_declaration_format','date_of_manufacture_format','licence_or_registration_if_applicable',
      'ingredient_or_material_declaration_if_applicable','mandatory_safety_warnings_if_applicable') else '[]'::jsonb end,
    'optional_branding', jsonb_build_array('logo','collection','tagline','care_instructions')
  );
$$;

-- ── generate_label — validate eligibility + integrity, record the print job (returns the payload) ──
create or replace function public.generate_label(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid := nullif(p->>'batch_id','')::uuid; v_template uuid := nullif(p->>'template_id','')::uuid;
  v_qty int := coalesce((p->>'quantity')::int, 1); v_actor uuid := nullif(p->>'actor_id','')::uuid;
  b public.manufacturing_batches%rowtype; t public.label_templates%rowtype; v_payload jsonb; v_vid uuid;
begin
  if v_batch is null or v_template is null then raise exception 'generate_label: batch_id and template_id required' using errcode='invalid_parameter_value'; end if;
  if v_qty <= 0 then raise exception 'generate_label: quantity must be > 0' using errcode='invalid_parameter_value'; end if;
  select * into b from public.manufacturing_batches where id = v_batch;
  if not found then raise exception 'generate_label: batch % not found', v_batch using errcode='foreign_key_violation'; end if;
  select * into t from public.label_templates where id = v_template;
  if not found or not t.active then raise exception 'generate_label: template not found/inactive' using errcode='check_violation'; end if;
  v_vid := b.variant_id;
  -- SERVER-ENFORCED eligibility (Part 7): a retail / product-batch label must never be printed for a batch
  -- that is not genuinely released/approved, nor for a held/recalled batch.
  if t.purpose in ('retail','product_batch_id') then
    if b.recall_state <> 'none' then raise exception 'generate_label: batch is %, not eligible for a % label', b.recall_state, t.purpose using errcode='check_violation'; end if;
    if b.lifecycle_status <> 'qc_approved' then raise exception 'generate_label: batch is % — a % label needs a qc_approved batch', b.lifecycle_status, t.purpose using errcode='check_violation'; end if;
    if not exists (select 1 from public.batch_design_validations where config_fingerprint = public.batch_config_fingerprint(v_batch) and result='pass' and state='approved') then
      raise exception 'generate_label: no current approved design validation — not eligible for a % label', t.purpose using errcode='check_violation';
    end if;
  end if;
  v_payload := public.batch_label_payload(v_batch, t.purpose);
  -- Batch-code integrity: the payload's code is the batch's immutable code (never regenerated here).
  if (v_payload->'verified'->>'batch_code') is distinct from b.batch_code then
    raise exception 'generate_label: batch-code integrity check failed' using errcode='check_violation';
  end if;
  insert into public.label_print_jobs(batch_id, variant_id, template_id, template_key, template_version, purpose, batch_code, quantity, data_snapshot, printed_by)
  values (v_batch, v_vid, v_template, t.template_key, t.version, t.purpose, b.batch_code, v_qty, v_payload, v_actor);
  return jsonb_build_object('ok', true, 'batch_code', b.batch_code, 'purpose', t.purpose, 'template_version', t.version,
                            'quantity', v_qty, 'encoded_value', b.batch_code, 'payload', v_payload);
end $$;

-- ── Seed baseline templates (dimensions UNVERIFIED — flagged; generic small-format until confirmed) ──
insert into public.label_templates(template_key, version, purpose, title, dimensions, dimensions_status, fields)
values
 ('internal_tray', 1, 'internal_mfg', 'Internal production/curing tray', '{"w_mm":100,"h_mm":60}', 'unverified', '["batch_code","product_name","variant","net_quantity","manufacturing_date","lifecycle_status","quantity"]'),
 ('product_batch_id', 1, 'product_batch_id', 'Product batch identifier', '{"w_mm":30,"h_mm":15}', 'unverified', '["batch_code","net_quantity","manufacturing_date"]'),
 ('retail_candle', 1, 'retail', 'Retail packaging (candle)', '{"w_mm":70,"h_mm":40}', 'unverified', '["product_name","variant","net_quantity","batch_code","manufacturing_date"]')
on conflict (template_key, version) do nothing;

revoke all on function public.batch_label_payload(uuid, text)  from public, anon, authenticated;
revoke all on function public.generate_label(jsonb)            from public, anon, authenticated;
grant  execute on function public.batch_label_payload(uuid, text) to service_role;
grant  execute on function public.generate_label(jsonb)        to service_role;
