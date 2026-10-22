# Cost Controls

The goal is predictable spend on the two paid services already in use — **Vercel Pro** and
**Supabase Pro** — with **no new paid services** added for dev/staging/CI.

## What we deliberately did NOT add

- ❌ A second hosted Supabase project for staging (~\$10/mo) — development uses **free local Supabase
  in Docker** instead. See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).
- ❌ Paid CI — GitHub Actions free tier runs typecheck/lint/test
  ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).
- ❌ Paid monitoring/staging tooling.

## Vercel — set Spend Management first

**Set a hard spend threshold before traffic ramps:** *Vercel → Settings → Billing → Spend Management*.
Choose a monthly amount you're comfortable with and an action (notify, and optionally **pause**
projects when exceeded). This is the single most important cost guardrail — do it on day one.

Also:
- Set **budget alerts** (email) at, say, 50% / 80% / 100% of the threshold.
- Review the **Usage** dashboard weekly for the first month.

### What drives Vercel cost here

| Driver | Why it matters for Samorah | Mitigation |
|---|---|---|
| **Function invocations** | **11 cron jobs**, five at `*/5` → ~3,000+ cron invocations/day before any user traffic. | Keep cron handlers fast and cheap; widen a schedule (e.g. `*/5` → `*/15`) if a job doesn't need 5-min granularity. |
| **Function duration / region** | Every server request hits Supabase. | Functions in **`bom1`** (next to the DB) keep durations short — see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md). |
| **Image Optimization** | Next/Image transforms count toward usage. | Images are served via **Cloudinary** (own CDN/transform), which keeps work off Vercel's optimizer. |
| **Bandwidth** | Traffic + large assets. | Cloudinary CDN for media; cache static assets. |
| **ISR/build** | PDPs use ISR (`revalidate = 300`); builds on each deploy. | Fine as-is; avoid needless full redeploys. |

> The `*/5` crons are the biggest *baseline* cost (they run regardless of traffic). If cost creeps,
> the first lever is the cron cadence in `vercel.json`.

## Supabase Pro

- Already paid; includes the Mumbai production DB, auth, storage, and **automatic daily backups**.
  **Point-in-Time Recovery (PITR) is a separate paid add-on — not included and not assumed enabled**
  ([ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md)). Enabling it is a deliberate billing choice.
- Cost grows with **database size, egress, and storage**. Watch *Dashboard → Reports* for row/size
  growth; the biggest surprises are usually unbounded log/event tables.
- Local development adds **₹0** to Supabase — it runs in Docker, not against the hosted project.

## Monitoring spend — routine

- [ ] Vercel **Spend Management** threshold + action set
- [ ] Vercel budget alert emails on
- [ ] Weekly glance at Vercel **Usage** and Supabase **Reports** for the first month
- [ ] Revisit cron cadence if function invocations dominate the bill
- [ ] Keep dev on **local Supabase** — don't spin up paid projects for day-to-day work

## When a hosted staging *is* worth paying for

Only once multiple people need to validate against production-like data simultaneously, or you need
to rehearse destructive migrations against real-shaped data. At that point a single small paid
Supabase project is the clean answer — the app is already structured so pointing a Vercel
**Preview** environment at it is a config change, not a rewrite.
