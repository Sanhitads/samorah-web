-- Phase 12A — fix a batch-code sequence-exhaustion defect (integrity / launch-blocking).
--
-- DEFECT: generate_batch_code() padded the sequence with lpad(seq::text, 2, '0'). Postgres lpad
-- TRUNCATES when the input is longer than the width, so once a scope (PREFIX-FORMAT-YYMMDD) passes
-- 99 batches the code silently truncates — seq 100 -> '10', 101 -> '10', 110 -> '11' — colliding with
-- the already-used two-digit codes and tripping manufacturing_batches_batch_code_key. This is exactly
-- what corrupted the accumulated test batches on a shared product. The sequence COUNTER was always
-- correct and monotonic; only the formatting truncated.
--
-- FIX: pad to a MINIMUM of two digits but never truncate — lpad(text, greatest(2, char_length(text)), '0').
-- Codes 01..99 are unchanged; 100+ now render in full ('100', '101', ...). Additive, forward-only; no data
-- rewrite (existing <=99 codes are unaffected; the truncation only ever produced collisions, never valid rows).
create or replace function public.generate_batch_code(p_prefix text, p_format text, p_date date)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare v_prefix text; v_format text; v_ymd text; v_scope text; v_seq integer; v_seqtxt text;
begin
  v_prefix := upper(nullif(btrim(coalesce(p_prefix,'')), ''));
  v_format := upper(nullif(btrim(coalesce(p_format,'')), ''));
  if v_prefix is null or v_format is null or p_date is null then
    raise exception 'generate_batch_code: prefix, format and date are required' using errcode = 'invalid_parameter_value';
  end if;
  v_ymd   := to_char(p_date, 'YYMMDD');
  v_scope := v_prefix || '-' || v_format || '-' || v_ymd;
  v_seq   := public.next_batch_sequence(v_scope);
  v_seqtxt := v_seq::text;
  -- Minimum width 2, but NEVER truncate a longer sequence (prevents the >99 collision).
  return v_prefix || '-' || v_format || '-' || v_ymd || '-' || lpad(v_seqtxt, greatest(2, char_length(v_seqtxt)), '0');
end $$;

revoke all on function public.generate_batch_code(text, text, date) from public, anon, authenticated;
grant  execute on function public.generate_batch_code(text, text, date) to service_role;
