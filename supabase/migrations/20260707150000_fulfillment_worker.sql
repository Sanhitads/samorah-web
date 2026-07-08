-- Phase 2B.4 — fulfillment worker plumbing. A scheduled worker claims queued jobs
-- and dispatches side-effects (confirmation email, later Shiprocket). Claiming uses
-- FOR UPDATE SKIP LOCKED so two concurrent workers never process the same job
-- (no double-send). attempts is bumped on claim for retry accounting.

create or replace function public.claim_fulfillment_jobs(p_job_type text, p_limit int default 10)
returns table (id uuid, order_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.fulfillment_jobs f
  set status = 'processing', attempts = f.attempts + 1, updated_at = now()
  where f.id in (
    select j.id from public.fulfillment_jobs j
    where j.status = 'queued' and j.job_type = p_job_type
    order by j.created_at asc
    limit p_limit
    for update skip locked
  )
  returning f.id, f.order_id, f.attempts;
end;
$$;

-- Mark a claimed job: 'done' | 'failed' (terminal) | 'queued' (retry next run).
create or replace function public.complete_fulfillment_job(p_id uuid, p_status text, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.fulfillment_jobs
  set status = p_status, last_error = nullif(p_error, ''), updated_at = now()
  where id = p_id;
$$;

revoke all on function public.claim_fulfillment_jobs(text, int)         from public, anon, authenticated;
grant  execute on function public.claim_fulfillment_jobs(text, int)     to service_role;
revoke all on function public.complete_fulfillment_job(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.complete_fulfillment_job(uuid, text, text) to service_role;
