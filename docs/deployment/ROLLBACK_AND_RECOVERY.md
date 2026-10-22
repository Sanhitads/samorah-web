# Rollback & Recovery

When a release misbehaves, recover **code** and **data** separately. Code rollback on Vercel is
instant and safe; data rollback is deliberate and never destructive.

## Code — instant rollback (Vercel)

A bad deploy is undone by re-promoting the previous good deployment. No rebuild, no git change.

1. Vercel → **Deployments**.
2. Find the last known-good production deployment.
3. **⋯ → Promote to Production** (a.k.a. "Instant Rollback").
4. Verify the site; the previous build is live within seconds.

Then fix forward in git:

```bash
git revert <bad-commit>        # safe: creates a new commit, never rewrites history
git push origin replatform/nextjs
```

- **Never** `git push --force` the production branch or delete it to "undo" — revert instead.
- `git revert` (not `reset`) keeps history intact and auditable.

## Data — recovering the database

> Code rollback does **not** roll back the database. If a release ran a migration or wrote bad data,
> handle the data explicitly. **Never** fix production with `truncate`, an unguarded `delete`, or
> `supabase db reset --linked`.

### A migration needs undoing

Write a **new forward migration** that reverses the change (the "contract" of expand-and-contract),
prove it locally with `npm run db:reset`, review it, then `supabase db push --linked`. Because
releases are expand-only, the previous code generally still works against the new schema while you
prepare the reversal — that's the safety margin expand-and-contract buys you.

### Bad data was written

- Scope the fix precisely: a targeted `update … where …` in the **Dashboard → SQL Editor**, reviewed
  first, inside a transaction (`begin; … ; -- check counts ; commit;`).
- Prefer correcting forward over deleting. If rows must go, snapshot them first
  (`create table _recover_x as select * from x where …`).

### Backups & point-in-time recovery — know exactly what you have

**Do not assume PITR is enabled.** Be precise about the two different things Supabase offers:

| | Daily backups | Point-in-Time Recovery (PITR) |
|---|---|---|
| Included with Pro? | **Yes** — automatic **daily** logical backups (≈7-day retention). | **No** — a **separate paid add-on**; off unless someone enabled + paid for it. |
| Granularity you can restore to | The last **daily** snapshot. | Any second/minute within the retention window. |
| Worst-case data loss on restore | **Up to ~24h** (everything since the last daily backup is lost). | Down to seconds — *but only if PITR is actually enabled on this project.* |

**Verify first, in the dashboard:** *Supabase → Database → Backups*. If PITR is **not** listed/enabled,
your only restore point is the latest **daily** backup, with up to ~24h of potential data loss. Enabling
PITR costs extra — treat that as a billing decision, not a given. This setup adds **no** paid add-ons by
default (see [COST_CONTROLS.md](./COST_CONTROLS.md)), so assume **daily backups only** until you confirm
otherwise.

**Restoration limitations (both modes):**
- A restore reverts the **whole database** — you cannot cherry-pick one table from the dashboard
  restore flow. Everything goes back to the chosen point.
- It causes **downtime** and requires coordination; treat it as break-glass, not routine.
- **Storage (bucket objects) are backed up separately from the Postgres database.** A database restore
  does **not** necessarily bring back files deleted from Storage, and vice versa. Confirm what your plan
  covers before relying on it for media recovery.
- **Data written after the restore point is lost.** With daily-only backups that can be a full day of
  orders. For anything high-value, prefer a surgical forward fix (below) over a full restore.

## Uncertain notification deliveries (email) — manual review

Delivery is **at-least-once** with provider de-dup: each email carries a per-recipient `Idempotency-Key`
(`<notification_log.id>:<address>`), so Resend collapses repeat sends **within its 24h window** — a crash
between "provider accepted" and "DB recorded success" does not double-send a retry inside 24h.

- **Durable state:** which recipients already received a message is persisted in
  `notification_log.delivered_recipients` (a DB array, not in memory), so a retry re-sends only the
  still-failed recipients. A stranded `sending` row (crash during the first attempt) is reclaimed by the
  claim RPC and retried.
- **Auto-replay is capped at 20h** (`AUTO_REPLAY.maxAgeHours`), safely **inside** the 24h idempotency
  window, so automatic replay can never produce a cross-window duplicate. **Nothing is lost:** a dead
  letter older than 20h is **not deleted** — it stays in the DLQ (`status = 'dead'`) for **manual review**.
- **Manual review path:** in the admin Operations Center notification log (`/api/admin/notifications/log`,
  action `replay` → `replayDeadLetter`, staff-gated), an operator inspects the dead letter, confirms from
  the provider dashboard whether the original was actually delivered, and replays it only if it was not —
  the deliberate, human-reconciled path for deliveries older than the idempotency window.

## Payments & orders safety during an incident

- Order writes are idempotent around the Razorpay flow; a redeploy/rollback does not double-charge.
- If checkout is broken, it's safer to **disable the pay button / show maintenance** than to let
  half-complete orders accumulate. Roll back code first (instant), then reconcile any in-flight
  orders from the Razorpay dashboard against `orders`/`payment_attempts`.

## Incident quick-path

1. **Stabilize:** Instant-rollback to the last good Vercel deployment.
2. **Assess:** Was it code-only, or did data/schema change? Code-only → you're already recovered.
3. **Data:** If schema/data changed, write a reviewed forward fix (or PITR for a disaster).
4. **Verify:** Run [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) §8 checks.
5. **Fix forward:** `git revert` + a clean redeploy; post-mortem the cause.
