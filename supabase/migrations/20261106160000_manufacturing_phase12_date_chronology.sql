-- Phase 12 (acceptance correction) — enforce batch date chronology (data-integrity / launch-blocking).
--
-- DEFECT: create_batch stored cure_start_date / earliest_release_date with NO ordering check, so a batch
-- could have an earliest-release (or cure) date BEFORE its manufacturing date — an impossible curing timeline
-- that showed in the admin screens. (Production-start-before-manufacturing came from fixtures using a FUTURE
-- manufacturing_date while starting production now; corrected in fixtures to realistic past dates.)
--
-- FIX: a BEFORE INSERT/UPDATE trigger that validates the ordering manufacturing_date ≤ cure_start_date ≤
-- earliest_release_date whenever those dates are present. It fires on new rows and on any row whose dates
-- actually change, so EXISTING batch history is never re-validated or overwritten, and authorised HISTORICAL
-- (back-dated) entries remain allowed — only impossible orderings are rejected, never silently accepted.
create or replace function public.tg_batch_date_chronology()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- On UPDATE, skip when none of the three dates changed (so editing qty/lifecycle on a legacy row with
  -- pre-existing odd dates is not blocked — history is preserved, not rewritten).
  if tg_op = 'UPDATE'
     and new.manufacturing_date   is not distinct from old.manufacturing_date
     and new.cure_start_date       is not distinct from old.cure_start_date
     and new.earliest_release_date is not distinct from old.earliest_release_date then
    return new;
  end if;
  if new.cure_start_date is not null and new.manufacturing_date is not null
     and new.cure_start_date < new.manufacturing_date then
    raise exception 'batch dates: cure start (%) cannot precede the manufacturing date (%)', new.cure_start_date, new.manufacturing_date using errcode = 'check_violation';
  end if;
  if new.earliest_release_date is not null and new.manufacturing_date is not null
     and new.earliest_release_date < new.manufacturing_date then
    raise exception 'batch dates: earliest release (%) cannot precede the manufacturing date (%)', new.earliest_release_date, new.manufacturing_date using errcode = 'check_violation';
  end if;
  if new.earliest_release_date is not null and new.cure_start_date is not null
     and new.earliest_release_date < new.cure_start_date then
    raise exception 'batch dates: earliest release (%) cannot precede cure start (%)', new.earliest_release_date, new.cure_start_date using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_batch_date_chronology on public.manufacturing_batches;
create trigger trg_batch_date_chronology before insert or update on public.manufacturing_batches
  for each row execute function public.tg_batch_date_chronology();
