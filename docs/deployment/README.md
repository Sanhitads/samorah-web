# Samorah — Deployment & Development Architecture

This folder documents how Samorah is developed locally and deployed to production,
without disrupting the live store. Start here, then read the doc you need.

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The three environments (Local / Preview / Production), what backs each, and the Git branch model. |
| [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) | Clone → local Supabase (Docker) → seed → `npm run dev`. Zero cost, no hosted services touched. |
| [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) | The local vs Preview vs Production variable matrix and browser-safety review. (Full per-var list: [`../DEPLOYMENT_ENV.md`](../DEPLOYMENT_ENV.md).) |
| [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) | Vercel Pro project settings, branch/region config, env setup, first deploy, verification. |
| [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) | Expand-and-contract migration workflow; how schema changes reach production safely. |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | The gate to run before every release, plus the GitHub release flow. |
| [ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md) | How to undo a bad deploy or migration (code and data) without data loss. |
| [COST_CONTROLS.md](./COST_CONTROLS.md) | Keeping spend predictable: Vercel Spend Management, cost drivers, the no-second-Supabase decision. |

## The one-paragraph version

Production is the existing **hosted Supabase Pro project (Mumbai)** plus the Next.js app on
**Vercel Pro**. Development is **local Supabase in Docker** with **synthetic seed data** — it never
touches the hosted database. Pull requests get **Vercel Preview** deployments wired to safe test
config (no live payments, no production service-role key). Schema changes flow local → reviewed
migration → production using **expand-and-contract**, never a destructive reset.

## Guardrails (do not violate)

- **Never** run `supabase db reset --linked`, truncate, or drop against the hosted/production database.
- **Never** put the production `service_role` key or Razorpay **live** keys into Preview or local.
- **Never** force-push or delete the production branch, or rewrite its history.
- Local development and `supabase db reset` act **only** on the local Docker Postgres.
