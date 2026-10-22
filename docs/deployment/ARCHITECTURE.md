# Architecture — Environments & Branches

Samorah runs on three environments. The design goal is a reliable, low-cost setup where
development is fully local and free, and the hosted production database is never put at risk.

## The three environments

| | Local | Preview (Vercel) | Production (Vercel) |
|---|---|---|---|
| **Host** | Your machine (`next dev`) | Vercel (per–pull request) | Vercel (production domain) |
| **Database** | Local Supabase in Docker | Hosted Supabase — *see note* | Hosted Supabase Pro (Mumbai) |
| **Data** | Synthetic seed (`supabase/seed.sql`) | Real schema, non-destructive | Real customer/catalogue data |
| **Payments** | Razorpay **Test** | Razorpay **Test** | Razorpay **Live** |
| **Email** | Captured by Mailpit (no real send) | Off / test sender | Resend (live) |
| **Indexing** | n/a | `noindex` (robots) | indexable |
| **Cost** | ₹0 | Included in Vercel Pro | Vercel Pro + Supabase Pro |

> **Preview database note.** Preview deployments share the hosted Supabase project's schema, but
> **must not** carry the production `service_role` key or live payment keys. Treat Preview as
> read-mostly and test-only: no live payments, no stock mutation against real inventory. A fully
> isolated hosted staging database is deferred (it is a second paid project ~\$10/mo); the app is
> structured so that adding one later is a config change, not a rewrite. Until then, prefer **local**
> for anything that writes data. See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).

## Why local Supabase (not a second hosted project)

- **Zero marginal cost** — Docker on the developer's machine, no new paid service.
- **Safe by construction** — `supabase db reset` (without `--linked`) can only ever touch the local
  Postgres on `127.0.0.1:54322`. Production cannot be reset by accident.
- **Reproducible** — all 102 migrations in `supabase/migrations/` + `supabase/seed.sql` rebuild the
  entire schema and sample data from scratch in one command. Verified: `supabase db reset` applies
  cleanly and seeds 4 products / 8 variants / 3 users / 1 order.

## Data & request flow (production)

```
            Browser ──────────────┐
               │ (anon key, RLS)   │ Razorpay Checkout (live key_id)
               ▼                   ▼
   Vercel Edge/Node (Next.js 15 App Router)
      │  server: service_role (admin ops)       Razorpay webhook ──► /api/webhooks/razorpay
      │  11 Vercel Cron jobs ─► /api/cron/* (Bearer CRON_SECRET)
      ▼
   Supabase (Mumbai): Postgres 17 + Auth + Storage + RLS
      ▲
   Cloudinary (image CDN)   Resend (email)   GA4/GTM/Clarity (analytics)
```

Vercel Functions should run in **`bom1` (Mumbai)** to sit next to the Supabase region and minimize
DB round-trip latency. See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

## Git branch model

The repository currently has two long-lived branches, and they are **not** what branch names alone
might suggest — this was verified against the actual history:

| Branch | What it actually is | Relationship |
|---|---|---|
| `replatform/nextjs` | **The real, release-ready Next.js application.** GitHub default branch. | 595 commits **ahead** of `main`. |
| `main` | The original Vite/React **prototype** (initial commit only). | Ancestor of `replatform/nextjs`; 0 commits ahead. |

**Decision: `replatform/nextjs` is the production branch.** It holds the actual app; `main` does not.
Do **not** "merge main into the app" or treat `main` as newer — that would be backwards.

Because `main` is a strict ancestor, promoting the name `main` later (if desired) is a **lossless
fast-forward**, never a history rewrite:

```bash
# OPTIONAL future step — only if you want the production branch named `main`.
git checkout main
git merge --ff-only replatform/nextjs   # pure fast-forward: no merge commit, no lost history
git push origin main
# then set main as the GitHub default + Vercel Production Branch, and retarget open PRs.
```

Until/unless that is done, set **Vercel Production Branch = `replatform/nextjs`** (zero git
operations, zero risk). Both options are safe; the second is just cosmetic.

**Never** force-push, delete, or rewrite the history of the production branch.

## Release flow (summary)

```
feature branch ──PR──► Vercel Preview (build + noindex + test config)
      │ CI: typecheck · lint · test       review
      ▼
production branch ──► Vercel Production (auto-deploy) ──► GitHub Release tag
```

Details: [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md). Undoing a release:
[ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md).
