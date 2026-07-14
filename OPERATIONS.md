# SAMORAH — Operations Run-book

Operational reference for running the platform in production: scheduled jobs, privacy/retention
maintenance, monitoring, alerting, and disaster recovery. Scoped to the account/auth subsystem and
the commerce cron workers. Companion to
[docs/authentication/architecture.md](docs/authentication/architecture.md) and
[docs/AUTH_PRIVACY.md](docs/AUTH_PRIVACY.md).

---

## 1. Scheduled jobs (cron)

All crons are declared in [`vercel.json`](vercel.json), run as Vercel Cron (invokes via **GET**), and
are guarded by `CRON_SECRET` (`src/lib/cronAuth.ts`). **An endpoint with no `CRON_SECRET` set refuses
every request (closed by default)** — so the secret is a required production env var.

| Job | Path | Schedule (UTC) | Purpose | Idempotent? |
|---|---|---|---|---|
| Fulfillment | `/api/cron/fulfillment` | `*/5 * * * *` | Drain fulfillment/email jobs | Yes |
| Reservations | `/api/cron/reservations` | `*/5 * * * *` | Expire stale stock reservations | Yes |
| Retention | `/api/cron/retention` | `0 3 * * *` (daily 03:00) | Purge login/audit history to windows | Yes |

**Required env vars:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (admin client),
`NEXT_PUBLIC_SUPABASE_URL`, `IP_HASH_SALT` (falls back to the service-role key), plus the commerce
integration keys used by fulfillment.

### Running a job manually
Every cron route accepts GET and POST with the secret. To force a run (drain a backlog, verify a
fix) hit it with the secret header:

```bash
curl -s -H "x-cron-secret: $CRON_SECRET" https://<host>/api/cron/retention
# → {"loginHistoryPurged": N, "auditPurged": M}
```

---

## 2. Privacy & retention maintenance

The **retention cron is the enforcement mechanism** for the documented windows (AUTH_PRIVACY.md):

| Data | Window | Enforced by |
|---|---|---|
| `login_history` | 180 days | retention cron (`lt created_at`) |
| `account_audit_log` | 730 days (2y) | retention cron |
| Cart/wishlist tombstones | 30 days | pruned in-merge (`lib/account/merge.ts`, no job needed) |
| `account_state`, `users`, addresses | until account deletion | `ON DELETE CASCADE` |

- **Purge efficiency:** `created_at` purge indexes exist on both history tables, so the daily delete
  stays an index range scan as the tables grow.
- **Data-subject deletion:** deleting the `auth.users` row cascades to every account table (no orphan
  PII). Do this via the Supabase admin API / dashboard, not raw SQL.
- **Data-subject export:** all account data is keyed by `user_id` with owner RLS — a per-user join
  over `account_state` / `login_history` / `account_audit_log` / `user_devices` /
  `user_auth_providers`. (A `/api/account/export` endpoint is the planned convenience wrapper.)

---

## 3. Monitoring

**What to watch, and where the signal already exists:**

| Signal | Source today | Healthy |
|---|---|---|
| Login success / failure | GA4 events via `track()` (`login_started/success/failure`, `google_login_success`, `magic_link_sent/completed`) | failure rate stable/low |
| First-login profile creation | `first_login_completed` event + `users` row count | 1 profile per new auth user |
| Cart/wishlist merge health | `cart_merge_occurred` / `wishlist_merge_occurred` | no unexpected spikes |
| Cron outcomes | Vercel Cron logs + each route's JSON `{ purged / processed }` | non-error, expected counts |
| Rate-limit pressure | 429 rate on account endpoints (Vercel logs) | low; a spike = abuse or a client loop |
| Auth API errors | Supabase Auth logs + Vercel function logs | no sustained 5xx |

There is **no dedicated auth health dashboard yet** — the metrics above are the inputs for one
(roadmap #8); surface them through the existing admin Health/Reports pattern when needed.

---

## 4. Expected alerts (what should page someone)

| Alert | Likely cause | First response |
|---|---|---|
| Retention cron failing / not run 24h+ | `CRON_SECRET` unset/rotated, admin key expired, DB unreachable | check env + Supabase status; run manually (§1) |
| Login failure rate spike | Google/Supabase outage, misconfigured OAuth redirect/domain, expired provider secret | check Supabase Auth → Providers; verify redirect URLs |
| First-login not creating profiles | `handle_new_user` trigger dropped/erroring | verify trigger exists on `auth.users`; check DB logs |
| Sustained 429s on account endpoints | abusive client, retry storm, or a client sync loop | inspect IPs in logs; the limiter is protecting you — don't raise limits blindly |
| Sync 5xx / oversized-payload rejections | client sending malformed/huge state | expected guard (`withinSize`); investigate the client |

---

## 5. Disaster recovery

- **Database:** Supabase provides managed point-in-time / daily backups (plan-dependent). DR = restore
  the Supabase project or branch. **Verify the backup cadence in the Supabase dashboard matches the
  RPO you need** before launch — this is a config decision, not code.
- **App:** stateless on Vercel; redeploy from `main` (or roll back to a previous deployment) restores
  service. No app-server state to recover — sessions live in Supabase-issued cookies/JWTs.
- **Secrets:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, OAuth client secret. Keep a
  secure copy; **rotating `IP_HASH_SALT` re-anonymises history** (old hashes stop correlating) — treat
  as a deliberate, documented action, not routine.
- **Recovery drills:** periodically (a) run each cron manually and confirm the JSON result, and (b)
  confirm a fresh Google + email + magic-link sign-in each still lands a session and a `users` row.

---

## 6. Change safety

- Migrations are additive and applied via `npx supabase db push`. Never edit a shipped migration —
  add a new one.
- The account API response contracts (`/api/account/*`) are consumed by the client stores; treat their
  shapes as stable. Rate-limit 429 + `Retry-After` is part of that contract.
- Keep the test suite green (`npx vitest run`) — the account algorithms (merge, tombstones, redirect
  guard, limiter) are unit-tested and are the regression net for this subsystem.
