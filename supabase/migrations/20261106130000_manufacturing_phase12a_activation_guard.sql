-- Phase 12A — enforce activation prerequisites + one-way tracking INSIDE the trusted DB transaction.
--
-- Previously activate_variant_tracking only set the state and stamped an epoch; the eligibility gate lived
-- only in operator/service convention (documented as a Phase-12 item). This moves the gate into the
-- SECURITY DEFINER function so a variant cannot enter 'tracked' unless its opening reconciles, and makes
-- tracking ONE-WAY (tracked history is permanent; the operational pause is the release/allocation switches,
-- which fail closed via the deferred attribution trigger — never deactivation). Audited/serialised/idempotent.
--
-- Backwards-compatible: a fresh EMPTY variant (stock 0, no overlay, no open exception) activates as before —
-- its opening is trivially consistent. A NON-EMPTY variant must have its physical stock represented in the
-- batch overlay (opening cutover) AND carry an approved legacy reconciliation sign-off (activation_eligible).
create or replace function public.activate_variant_tracking(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_variant uuid := nullif(p->>'variant_id','')::uuid;
  v_state   text := p->>'state';
  v_actor   uuid := nullif(p->>'actor_id','')::uuid;
  v_now     timestamptz := pg_catalog.now();
  v_cur     text;
  v_rec     jsonb; v_stock int; v_onhand int; v_openexc int; v_empty boolean;
begin
  if v_variant is null or v_state not in ('untracked','transition_pending','tracked') then
    raise exception 'activate_variant_tracking: variant_id and valid state required' using errcode='invalid_parameter_value';
  end if;
  perform 1 from public.variants where id = v_variant for update;      -- serialise against in-flight stock txns
  select tracking_state into v_cur from public.variants where id = v_variant;
  if v_cur is null then raise exception 'activate_variant_tracking: variant % not found', v_variant using errcode='no_data_found'; end if;

  -- Idempotent: already in the requested state → no-op, no new epoch.
  if v_cur = v_state then
    return jsonb_build_object('ok', true, 'variant_id', v_variant, 'state', v_state, 'idempotent', true);
  end if;

  -- ONE-WAY: a tracked variant may NEVER return to untracked/transition_pending. Tracking history is
  -- retained permanently; to stop activity use the release/allocation pause switches (fail-closed).
  if v_cur = 'tracked' and v_state <> 'tracked' then
    raise exception 'activate_variant_tracking: tracked → % is not permitted (tracking is one-way; pause via the release/allocation switches, do not deactivate)', v_state using errcode='check_violation';
  end if;

  if v_state = 'tracked' then
    -- Authorisation must be present (role capability is additionally enforced at the service layer).
    if v_actor is null then
      raise exception 'activate_variant_tracking: actor_id (authorisation) required to activate tracking' using errcode='check_violation';
    end if;
    -- Prerequisite gate (trusted transaction): reconciliation must leave no unresolved attribution discrepancy.
    v_rec     := public.variant_batch_reconciliation(v_variant);
    v_stock   := coalesce((v_rec->>'aggregate_stock')::int, 0);
    v_onhand  := coalesce((v_rec->>'physical_onhand')::int, 0);
    v_openexc := coalesce((v_rec->>'open_exception_qty')::int, 0);
    v_empty   := (v_stock = 0 and v_onhand = 0 and v_openexc = 0);
    if (v_rec->>'accounting_explained')::boolean is not true then
      raise exception 'activate_variant_tracking: unresolved attribution discrepancy — reconcile before activation' using errcode='check_violation';
    end if;
    if not v_empty then
      -- Opening balance must be fully represented in batches (physically consistent)…
      if (v_rec->>'physical_consistent')::boolean is not true then
        raise exception 'activate_variant_tracking: opening balance not represented in batches (aggregate % ≠ overlay %) — run the opening cutover first', v_stock, v_onhand using errcode='check_violation';
      end if;
      -- …and the human legacy reconciliation sign-off must be approved.
      if (v_rec->>'activation_eligible')::boolean is not true then
        raise exception 'activate_variant_tracking: variant not activation-eligible (approve the legacy reconciliation sign-off first)' using errcode='check_violation';
      end if;
    end if;
    update public.variants set tracking_state='tracked', tracked_at = coalesce(tracked_at, v_now) where id = v_variant;
    insert into public.variant_tracking_epochs(variant_id, epoch_at, activated_by) values (v_variant, v_now, v_actor); -- immutable, append-only
  else
    -- Pre-activation transitions only (untracked ↔ transition_pending); tracked is blocked above.
    update public.variants set tracking_state = v_state where id = v_variant;
  end if;

  return jsonb_build_object('ok', true, 'variant_id', v_variant, 'state', v_state);
end $$;

revoke all on function public.activate_variant_tracking(jsonb) from public, anon, authenticated;
grant  execute on function public.activate_variant_tracking(jsonb) to service_role;
