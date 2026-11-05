-- ============================================================================
-- MANUFACTURING — Phase 11A (A.3): distinguish label GENERATION from physical PRINTING. INERT, ADDITIVE.
-- ============================================================================
-- A generated label job is NOT proof that a physical label was printed. label_print_jobs stays append-only
-- (history is never overwritten); a separate, operator-confirmed, idempotent step records that the physical
-- print happened. No QC/inventory/lifecycle/recall state is ever changed by either step. DO NOT print for real.

alter table public.label_print_jobs add column if not exists status text not null default 'generated'
  check (status in ('generated','printed','void'));
alter table public.label_print_jobs add column if not exists printed_confirmed_by uuid references public.users(id) on delete set null;
alter table public.label_print_jobs add column if not exists printed_confirmed_at timestamptz;

-- Operator confirms the physical print actually happened (idempotent; append-only row is updated in place
-- only for this status transition, preserving all original generation evidence).
create or replace function public.confirm_label_printed(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'job_id','')::uuid; v_actor uuid := nullif(p->>'actor_id','')::uuid; j public.label_print_jobs%rowtype;
begin
  if v_id is null then raise exception 'confirm_label_printed: job_id required' using errcode='invalid_parameter_value'; end if;
  select * into j from public.label_print_jobs where id = v_id for update;
  if not found then raise exception 'confirm_label_printed: job % not found', v_id using errcode='foreign_key_violation'; end if;
  if j.status = 'printed' then return jsonb_build_object('ok', true, 'already_printed', true); end if;  -- idempotent
  if j.status = 'void' then raise exception 'confirm_label_printed: job is void' using errcode='check_violation'; end if;
  update public.label_print_jobs set status = 'printed', printed_confirmed_by = v_actor, printed_confirmed_at = pg_catalog.now() where id = v_id;
  return jsonb_build_object('ok', true, 'status', 'printed');
end $$;

revoke all on function public.confirm_label_printed(jsonb) from public, anon, authenticated;
grant  execute on function public.confirm_label_printed(jsonb) to service_role;
