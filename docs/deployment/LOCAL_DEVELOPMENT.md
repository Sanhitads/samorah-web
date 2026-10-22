# Local Development

A clean clone becomes a running store — storefront + admin + a seeded catalogue — with local
Supabase in Docker. Nothing here touches the hosted/production database, and it costs nothing.

## Prerequisites

- **Node 24 (LTS)** — the repo pins it via [`.nvmrc`](../../.nvmrc) and `engines` in `package.json`.
  With nvm: `nvm use` (or `nvm install 24`). Node 20 is deprecated for new Vercel deployments.
- **Docker Desktop** running — local Supabase (Postgres/Auth/Storage/Studio) runs as containers.
- The Supabase CLI ships as a dev dependency, so `npm run db:*` scripts call it via `npx` — no
  global install needed.

## First-time setup

```bash
# 1. Install dependencies (uses the pinned Node)
nvm use
npm ci

# 2. Start local Supabase (first run pulls Docker images — a few minutes, once)
npm run db:start

# 3. Apply all migrations + load synthetic seed data into the LOCAL db
npm run db:reset

# 4. Create your env file and fill in the two Supabase keys
cp .env.local.example .env.local
npm run db:status          # copy the Publishable key → NEXT_PUBLIC_SUPABASE_ANON_KEY
                           # copy the Secret key      → SUPABASE_SERVICE_ROLE_KEY

# 5. Run the app
npm run dev                # http://localhost:3000
```

`NEXT_PUBLIC_SUPABASE_URL` is already set to the fixed local API port
(`http://127.0.0.1:54321`) in the template, so you only paste the two keys.

## Local service URLs

| Service | URL | Use |
|---|---|---|
| App | http://localhost:3000 | the store |
| Supabase API | http://127.0.0.1:54321 | REST/Auth/Storage |
| Supabase Studio | http://127.0.0.1:54323 | browse/edit the local DB |
| Mailpit | http://127.0.0.1:54324 | **all outbound email lands here** — no real sends locally |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | direct psql access |

## What the seed gives you

`supabase/seed.sql` runs automatically on `npm run db:reset`. It is **entirely synthetic** — no real
customer, email, or payment data (addresses use the reserved `@example.test` domain). It adds, on top
of the categories/site-settings that migrations already seed:

- A **Signature Candles** category + a sample chapter (collection).
- **4 active products × 2 variants** each (one variant is deliberately below its low-stock
  threshold, so you can see the low-stock UI).
- **3 sign-in-able accounts** (password `devpassword`, or use the Mailpit magic link):
  - `dev-admin@example.test` — **admin**, reaches `/admin`.
  - `ananya.rao@example.test` — customer with an order + loyalty points.
  - `kabir.menon@example.test` — customer.
- **1 example order** with a line item, so order views and admin lists aren't empty.

Edit `supabase/seed.sql` and re-run `npm run db:reset` to change sample data. Keep it synthetic —
never paste real production rows into the seed.

## Everyday commands

| Command | Does |
|---|---|
| `npm run dev` | Start Next.js (dev uses `.next-dev`, so it won't clobber a `build`). |
| `npm run db:start` / `db:stop` | Start / stop local Supabase containers. |
| `npm run db:reset` | **Rebuild** the local DB from migrations + seed (destroys local data only). |
| `npm run db:status` | Show local URLs + keys. |
| `npm run db:new <name>` | Scaffold a new migration file. |
| `npm run db:diff` | Diff local schema → a migration (see [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)). |
| `npm run typecheck` / `lint` / `test` | The same gates CI runs. |

## Payments & email locally

- **Razorpay:** use **Test Mode** keys only (`rzp_test_…`). Never put live keys in `.env.local`.
  Webhook testing needs a tunnel (e.g. ngrok) pointed at a Razorpay test webhook; otherwise the app
  falls back to the `/verify` path.
- **Email:** leave `RESEND_API_KEY` blank. Local Supabase routes mail to **Mailpit**, so you can read
  what *would* have been sent at http://127.0.0.1:54324 without sending anything real.

## ⚠️ Running the test suite safely (it can write to whatever `.env.local` targets)

The **unit** project (the ~1325 fast tests) mocks Supabase and touches no database. But the
**`*.integration.test.ts`** suites hit a real database, and vitest auto-loads `.env.local` into
`process.env`. So a plain **`npm test`** runs:

- the **7 local-only** integration suites (gated on `INV_TEST_*` + a `127.0.0.1` guard) — these **skip**
  unless you set `INV_TEST_*`, and can never reach a non-local URL; and
- **~8 other** integration suites gated only on `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` —
  which `.env.local` provides. If `.env.local` points at the **hosted** project, these run **against
  hosted**, and several **write** (TAG-scoped orders/coupons/redirects, cleaned up in `afterAll`).

**Do not run `npm test` casually while `.env.local` points at production.** Safe options:

```bash
# A. Unit only — never touches any DB:
npx vitest run --project unit

# B. ALL integration suites against LOCAL (set every DB var to local; moving .env.local aside
#    guarantees prod is unreachable), then restore:
mv .env.local .env.local.bak
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<local secret>  NEXT_PUBLIC_SUPABASE_ANON_KEY=<local publishable> \
INV_TEST_SUPABASE_URL=http://127.0.0.1:54321 INV_TEST_SERVICE_KEY=<local secret> INV_TEST_ANON_KEY=<local publishable> \
  npx vitest run --project integration
mv .env.local.bak .env.local
```

**Recommended hardening (not yet applied):** gate the ~8 hosted-targeted integration suites behind the
same `127.0.0.1` guard the `INV_TEST_*` suites use, so `npm test` can never write to production
regardless of `.env.local`. Tracked as a follow-up.

## Troubleshooting

- **Ports already in use (54321–54324, 54322):** another Supabase project is running. `npm run db:stop`
  in the other project, or `npx supabase stop --project-id <id>`.
- **`db:reset` fails mid-seed:** the error names the table/constraint. Fix `supabase/seed.sql` and
  re-run; the reset is idempotent (fixed UUIDs + `on conflict` guards).
- **App shows no products:** you skipped `npm run db:reset`, or `.env.local` keys are stale — re-copy
  from `npm run db:status`.
- **Docker not running:** `db:start` fails immediately. Start Docker Desktop and retry.
