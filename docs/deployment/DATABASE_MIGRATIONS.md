# Database Migrations

Schema changes are SQL files in `supabase/migrations/` (**107** today). They are developed and tested
**locally**, then applied forward to production. The hosted database is never reset.

> **STATUS (2026-10-17).** The four `20261016*` hardening migrations are **APPLIED to production**. The
> repo now holds **107** files; the **one** currently-pending migration is
> `20261017120000_definer_empty_search_path` (hardens the three SECURITY DEFINER functions to an empty
> `search_path`; also broadens the stranded-`retrying` reclaim). **Sections below that describe pushing
> "the four 2026-10-16 migrations" are retained as the historical runbook** for that completed push — the
> **same procedure** applies to the one new migration. When you run `migration list` today, expect the
> **106** applied versions to match Local==Remote and exactly **one** (`20261017120000`) to be Local-only.

## The cardinal rules

- 🚫 **Never** `supabase db reset --linked` — that wipes and rebuilds the *linked* (production)
  database. `db reset` without `--linked` only ever touches local Docker Postgres.
- 🚫 **Never** drop/rename/retype a column or table in the same release that stops using it. Use
  **expand-and-contract** (below).
- ✅ Every production change is a **new, forward migration** that has already been proven locally with
  `npm run db:reset`.
- ✅ Review every migration's SQL before it reaches production. Prefer additive, reversible steps.

## Authoring a migration (local)

```bash
npm run db:new add_something          # creates supabase/migrations/<timestamp>_add_something.sql
#   …write the SQL…
npm run db:reset                      # re-applies ALL migrations + seed from scratch, locally
#   …verify the app still builds and behaves: npm run typecheck && npm run test && npm run dev…
```

`npm run db:reset` is the real test: it proves the migration applies cleanly **from an empty database
through all 107 migrations**, which is exactly what a fresh environment does. If reset is green, the
migration is reproducible.

`npm run db:diff` can capture ad-hoc changes you made in Studio into a migration file — review and
rename what it generates; don't ship an unreviewed diff.

## Comparing local vs hosted migration state (read-only)

Before pushing, confirm what the hosted project is missing — **without changing anything**:

```bash
npx supabase link --project-ref <your-project-ref>   # one-time; stores the ref
npx supabase migration list                          # shows Local | Remote side by side (READ-ONLY)
```

`migration list` only reads both histories; it does not apply, repair, or reset. Do **not** run
`supabase migration repair` or `db reset --linked` against production.

The repo holds **107** migrations. **106 are applied to production** (102 pre-existing + the **4**
`20261016*` hardening migrations: coupon-RPC revoke, analytics-RPC revoke, notification atomic-claim,
cron run-lock — all pushed 2026-10-16). The **one** pending delta is `20261017120000` (definer empty
`search_path`). It is additive/forward-only (a `CREATE OR REPLACE` of three functions with identical
signatures) with **no row-data mutation** and no destructive operation, so it is safe to apply once
reviewed — `supabase db push --linked` when approved. (The paragraphs below about pushing "the four"
describe the already-completed 2026-10-16 push; the procedure is identical for the new one.)

## Production execution plan — the four 2026-10-16 hardening migrations

Apply in **timestamp order**; all are additive / forward-only (no `drop`, `truncate`, `update`, or
`delete` of rows). Each is **backward-compatible with the currently-deployed code** (new functions/columns
are simply unused by old code), so they can be applied **before** the new app deploy. The new app code
*requires* them (it calls `claim_due_notifications` / `try_acquire_cron_lock`), so the order is:
**apply migrations → then deploy the app.**

| # | Version | Operations | Behavior change |
|---|---|---|---|
| 1 | `20261016120000` | `revoke all` on the 4 coupon RPCs from public/anon/authenticated; `grant execute` to service_role | Authorization: closes anon execute of coupon RPCs. App unaffected (calls via service_role). |
| 2 | `20261016130000` | same for `analytics_refresh_mvs()` | Authorization: closes anon-triggered MV refresh. |
| 3 | `20261016140000` | `alter table notification_log add column claimed_at`; `create` `claim_due_notifications` (SKIP LOCKED lease) | Retry worker switches to the atomic claim; old worker ignores the column (still works). |
| 4 | `20261016150000` | `create table cron_locks` (+RLS, revoke); `create` `try_acquire_cron_lock` / `release_cron_lock` | Incident cron serializes via the run-lock; old route ignores it. |

**Before pushing:**
- [ ] Read-only compare: `npx supabase migration list` shows exactly these 4 as Local-only (pending on Remote).
- [ ] Confirm a recent **daily backup** exists (Dashboard → Database → Backups); PITR is NOT assumed. For
      these additive changes, rollback is a small reverse migration (drop the column/table/functions,
      re-grant), not a restore.
- [ ] Compatibility: the test suite's integration proofs for these paths pass against a local copy of the
      schema (inventory/payment/notification suites) — run them against a staging/local DB with the same
      migrations before prod if you want a pre-flight.

### Recommended: apply all four together (they are all reviewed + safe)

```bash
npx supabase migration list            # confirm the 4 pending, nothing unexpected
npx supabase db push --linked          # applies ONLY pending migrations, in order
```

> `db push` applies **every** pending migration, not a chosen subset. Run `migration list` first so you
> know precisely what is pending — it must be exactly these four and nothing else.

### If you want the two SECURITY fixes to land before the concurrency ones — stage by RELEASE, not by hand

`db push` applies all pending migrations. **Do not** hand-insert rows into
`supabase_migrations.schema_migrations` to fake a subset as applied — that is not a supported
deployment mechanism and it drifts history. Stage through the normal migration workflow instead:

1. **Release 1** — a commit/branch containing only `…120000` + `…130000`. `npx supabase db push --linked`
   applies exactly those two (they are the only pending files in that release). Deploy.
2. **Release 2** — a follow-up commit adding `…140000` + `…150000`. `db push` then applies exactly those.

This keeps the repo migrations and the hosted history as the single source of truth, in order, with no
manual records. (If all four are approved together, just push all four — they are independent and safe
in sequence.) After a privilege-changing migration, reload the API: `notify pgrst, 'reload schema';`.

## Dry-run, backup & rollback for the four pending migrations

**Compatibility:** all four are additive/forward-only and **backward-compatible with the currently
deployed code** (new columns/table/functions are simply unused by old code), so applying them before the
app deploy is safe. Verified read-only: hosted schema matches local except exactly these four (see the
schema-drift check in [PROD_TEST_INCIDENT.md](./PROD_TEST_INCIDENT.md)).

**Dry-run / preview (read-only):**
```bash
npx supabase migration list            # hosted vs local history — must show exactly the 4 pending
npx supabase db push --linked --dry-run   # prints the SQL that WOULD run, applies nothing
```
Also confirm the grants after apply (needs DB access):
```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('reserve_coupon','consume_coupon','release_coupon','restore_coupon','analytics_refresh_mvs');  -- expect all false
```

**Backup before push:** confirm a recent Supabase **daily backup** (Dashboard → Database → Backups). PITR
is a paid add-on — not assumed. Note: Supabase backups cover the **database only**; Samorah's imagery is in
**Cloudinary** (no Supabase Storage buckets in use), so no separate Storage-backup step is required here.

**Rollback (reverse migrations — additive, so each is a clean drop/re-grant):**
```sql
-- 20261016150000 (cron run-lock):
drop function if exists public.release_cron_lock(text, text);
drop function if exists public.try_acquire_cron_lock(text, integer);
drop table if exists public.cron_locks;
-- 20261016140000 (notification claim + recovery):
drop function if exists public.claim_due_notifications(integer);
alter table public.notification_log drop column if exists delivered_recipients, drop column if exists claimed_at;
-- 20261016130000 / 20261016120000 (security revokes): reversing RE-EXPOSES anon — do so only to undo deliberately:
-- grant execute on function public.analytics_refresh_mvs() to anon, authenticated;  -- (coupon RPCs similar)
```
Primary rollback is still the **Vercel code rollback** (old code ignores the new objects); dropping the DB
objects is optional cleanup. Prefer a forward-fix migration over a destructive restore.

## Post-migration verification (read-only)

Run these **after** `db push` to prove the hosted history matches local and the privilege revokes took
effect. All three are read-only `SELECT`s / `list`s — they change nothing.

**State note (2026-10-17):** the repo now holds **107** migration files — the 106 already applied to
production **plus one new pending** migration `20261017120000_definer_empty_search_path` (hardens the
three SECURITY DEFINER functions to an empty `search_path`; awaiting approval). So the expected picture
below is: the **106** previously-applied versions match `Local == Remote`, and **exactly one** (the new
definer-hardening migration) is Local-only / pending until it is approved and pushed.

**1 — Migration-version parity (local vs hosted):**
```bash
npx supabase migration list      # READ-ONLY. Prints Local | Remote | Time, newest first.
```
- Every one of the **106** applied versions must appear in BOTH the Local and Remote columns (same
  14-digit timestamps, no gaps).
- Exactly **one** row — `20261017120000` — is Local-only (blank Remote) = pending. Nothing else may be
  Local-only, and **nothing** may be Remote-only (a Remote-only version = history drift / a hand-applied
  change). Schema parity alone does **not** prove history parity, which is why this list is the authority.

**2 — Anonymous execution of the privileged RPCs is denied (authoritative, DB-level):**
```sql
-- Supabase → SQL Editor. Expect anon_can = false for ALL five rows.
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('reserve_coupon','consume_coupon','release_coupon','restore_coupon','analytics_refresh_mvs');
```
An automatable anon-HTTP-surface smoke (complements, does **not** replace, the SQL above) is
`npm run verify:prod-security`. It fails loudly if anon ever gets a 2xx (executes an RPC). Note its
limit: an empty-body POST only meaningfully exercises the zero-arg `analytics_refresh_mvs`; for the four
parameterized coupon RPCs a 404 is a signature mismatch, **not** proof of the revoke — so the
`has_function_privilege` query above is the authority for those.

**3 — SECURITY DEFINER search_path (after the new migration is applied):**
```sql
-- Expect each proconfig to contain: search_path=""  (empty — Postgres renders the empty value quoted)
-- once 20261017120000 is applied. Before it, reads search_path=public (2026-10-16 migrations) — also safe.
select proname, proconfig from pg_proc
where proname in ('claim_due_notifications','try_acquire_cron_lock','release_cron_lock');
```

## Expand-and-contract (how to change schema without downtime)

Split any breaking change across **separate releases** so old and new code both work in between:

1. **Expand** — add the new thing (nullable column, new table, new function) and backfill. Old code
   ignores it; new code can start writing it. *Deploy.*
2. **Migrate/dual-write** — new code reads/writes the new shape; backfill completes. *Deploy.*
3. **Contract** — once nothing reads the old shape, a later migration removes it. *Deploy.*

Example — renaming a column `a → b`: (1) add `b`, backfill from `a`, write both; (2) read from `b`;
(3) drop `a`. Never do all three at once.

## Applying migrations to production

Production already has all current migrations applied. For **new** ones, after they're proven locally
and reviewed:

```bash
# One-time: link the CLI to the hosted project (stores the ref; does NOT change data)
npx supabase link --project-ref <your-project-ref>

# Apply ONLY pending forward migrations to production (non-destructive):
npx supabase db push --linked
```

`db push` runs the pending migration files in order — it does **not** reset or drop anything on its
own; safety depends on the migrations being expand-only, which is the point of the rules above.
Alternatively, paste the reviewed SQL into the **Supabase Dashboard → SQL Editor** for a single change
you want to watch run.

After applying, if the change affects the API surface, reload PostgREST
(*Dashboard → API → Reload schema*, or `notify pgrst, 'reload schema';`).

## Before every schema change to production — checklist

- [ ] Migration applies cleanly via `npm run db:reset` locally (green, all 107 migrations).
- [ ] `npm run typecheck && npm run test` pass against the new schema.
- [ ] The change is **expand-only** for this release (no drop/rename of something still in use).
- [ ] SQL reviewed by a second person (or a careful second read): no `truncate`, no unguarded `drop`,
      no `update`/`delete` without a `where`.
- [ ] A rollback path is known (see [ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md)).
- [ ] You are running `db push`, **not** `db reset --linked`.
