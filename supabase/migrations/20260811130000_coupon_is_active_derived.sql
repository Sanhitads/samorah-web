-- Coupon Phase 2 — deprecate is_active: derive it from `status` so there is a SINGLE editable source of
-- truth (status). Writers now set `status`; is_active is kept consistent (for any not-yet-migrated reader
-- and the admin badge during transition) and will be dropped in a later cleanup migration once nothing
-- reads it. This ships together with the service changes that make `status` authoritative.
create or replace function public.coupons_sync_is_active()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;
drop trigger if exists trg_coupons_sync_is_active on public.coupons;
create trigger trg_coupons_sync_is_active before insert or update on public.coupons
  for each row execute function public.coupons_sync_is_active();
