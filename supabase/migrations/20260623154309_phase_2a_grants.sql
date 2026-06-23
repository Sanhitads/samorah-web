-- ============================================================================
-- Phase 2A — Data API grants
--
-- Supabase's implicit "grant on new table" default privileges did not apply to
-- the Phase 2A tables (the push ran as a non-postgres role), so anon /
-- authenticated / service_role had no base table privileges and every request
-- was denied (403) regardless of RLS. RLS only filters ROWS *after* a role
-- already holds the table privilege — so we grant explicitly here.
--
-- Convention from here on: each phase migration (2B+) includes its own grants
-- inline, so this separate grants file is a one-off to repair Phase 2A.
-- ============================================================================

-- ── Catalog: public read (RLS further restricts to active rows) ──────────────
grant select on
  public.categories,
  public.collections,
  public.products,
  public.variants,
  public.product_images,
  public.fragrance_notes
to anon, authenticated;

-- ── Identity: signed-in users (RLS further restricts to own rows) ────────────
grant select on public.users to authenticated;
-- (column-scoped UPDATE on public.users was already granted in the schema migration)
grant select, insert, update, delete on public.addresses to authenticated;

-- ── Server / admin role (bypasses RLS) — full access to this group ───────────
grant all on
  public.categories,
  public.collections,
  public.products,
  public.variants,
  public.users,
  public.addresses,
  public.product_images,
  public.fragrance_notes
to service_role;
