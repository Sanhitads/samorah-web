# Samorah — Go-Live Checklist

One checklist for launch. **✅ Verified** = confirmed locally / in code this session. **🔲 Live test** =
can only be confirmed on a real deployment. Deep-dives are linked.

## Release phases — what is approved at each gate
Each phase needs your explicit approval; approving one does **not** authorize the next.

1. **Safe to commit (repo-only)** — the reviewed diff: 4 SQL migrations, test guard + `vitest.config.ts`,
   notification fixes, `cronLock.ts`, CI, `vercel.json`, scripts, docs, tests. Validated (unit 1332, local
   integration 130, build 117, typecheck/lint). Committing ≠ deploying.
2. **Safe to push** — push the committed branch to GitHub (`replatform/nextjs`); set it as the protected
   production branch; introduce PR/feature-branch flow for post-launch changes.
3. **Production migrations — PENDING APPROVAL** — apply the 4 migrations via `supabase db push` after
   `migration list` + `--dry-run` + a confirmed backup ([DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)).
   Separately: the **footer restore** + the **deferred audit cleanup** ([PROD_TEST_INCIDENT.md](./PROD_TEST_INCIDENT.md)).
4. **Vercel setup** — project config: production branch, env scoping (no prod service-role/live keys in
   Preview), `bom1` region, OIDC, domain, Spend Management ([VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md),
   [PREVIEW_CHECKLIST.md](./PREVIEW_CHECKLIST.md)).
5. **Post-deployment live tests** — the 🔲 items below: Auth redirects, Razorpay live + webhook, real
   order/stock/email, catalogue + OG, cron execution, domain/HTTPS, monitoring, (later) GA4 WIF.

---

## 1. GitHub production branch
- ✅ Real app is on **`replatform/nextjs`** (`main` is the old prototype — [ARCHITECTURE.md](./ARCHITECTURE.md)); no config assumes `main` is live (one intentional dual CI trigger).
- 🔲 Set **Production Branch = `replatform/nextjs`** in Vercel; add branch protection requiring the CI `verify` check.

## 2. Vercel Production & Preview environment scoping
- ✅ Separation documented + a logged-in Preview user proven unable to mutate prod data (RLS + no service-role) — [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).
- 🔲 In the dashboard, confirm **Production-only** scope for `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, Razorpay/Resend/Cloudinary secrets; Preview uses `rzp_test_*` + anon key only; enable **Vercel Authentication** on Preview — full list in [PREVIEW_CHECKLIST.md](./PREVIEW_CHECKLIST.md).

## 3. Mumbai function region
- ✅ Pinned in `vercel.json` (`"regions": ["bom1"]`); no route pins a conflicting region/Edge runtime.
- 🔲 Confirm the dashboard honours `bom1` on your plan; spot-check function region after deploy.

## 4. Cron schedules & authentication
- ✅ 11 crons mapped to existing routes; all guarded by `cronAuthorized` (`CRON_SECRET` Bearer); UTC↔IST schedules confirmed sensible; retry/incident concurrency hardened (atomic claim + fenced run-lock) — [DEPLOYMENT_ENV.md](../DEPLOYMENT_ENV.md).
- 🔲 Requires Vercel **Pro** (minute-level crons); after deploy confirm jobs listed under *Cron Jobs* and a `CRON_SECRET`-bearer `curl` returns 200 (401 without).

## 5. Supabase Auth redirects
- 🔲 **Live test.** In Supabase → Auth → URL Config, set **Site URL** = `https://samorahstudio.com` and add Redirect URLs (prod domain + Vercel preview + `localhost:3000`). Verify Google OAuth + magic-link land back on the prod domain (not localhost). *(Not verifiable locally.)*

## 6. Razorpay live configuration
- ✅ Keys are server-gated; webhook signature + merchant guard verified in code; test-mode flows pass the integration suites locally.
- 🔲 **Live test.** Set `rzp_live_*` + live `RAZORPAY_WEBHOOK_SECRET` in Production; register the live webhook → `/api/webhooks/razorpay`; do one real low-value order and confirm capture + order finalize + webhook.

## 7. Order & inventory integrity
- ✅ **Strongly verified locally** — the inventory-ledger / payment-reservation / return / RTO integration suites (exactly-once reserve→finalize→cancel→expire, no-negative-stock, refund-once, restock-once, atomic rollback) **all pass against local Supabase**.
- 🔲 Live smoke: one real order decrements stock once; a cancel/refund releases correctly.

## 8. Email delivery
- ✅ Resend sender abstraction; per-recipient **idempotency key** (at-most-once within 24h); per-provider timeouts; partial-recipient retry + stranded-`sending` recovery (this round). Residual: >24h replay can duplicate (documented) — [ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md).
- 🔲 **Live test.** Verify the Resend **sending domain** (SPF/DKIM); send a real order-confirmation; confirm `order.confirmed` renders correctly from the DB template.

## 9. Catalogue & OG metadata
- ✅ Hosted catalogue **read-only verified intact**: 10 active products, 6 chapters, 5 content pages ([PROD_TEST_INCIDENT.md](./PROD_TEST_INCIDENT.md)). `verify-catalogue.mjs` detects empty/orphan/no-slug/zero-price. SEO/OG infra (canonicals, `robotsForEnv` noindex off prod, product LD) in place.
- 🔲 **Live test.** Run `npm run verify:catalogue` against Production env; spot-check PDPs render (ISR) with correct price/variants/images; validate OG tags with a social debugger; `sitemap.xml`/`robots.txt` resolve to `samorahstudio.com` and prod is indexable.

## 10. Google Cloud WIF (GA4 admin analytics)
- ✅ Implementation reviewed (Vercel OIDC → GCP STS → SA impersonation → Analytics Data v1beta; no SDK/keys). Currently parked (returns `not_configured`).
- 🔲 **Post-deploy.** Enable Vercel OIDC Federation; set `GA4_PROPERTY_ID` + `GCP_WORKLOAD_IDENTITY_AUDIENCE` + `GA4_SERVICE_ACCOUNT_EMAIL`; create the GCP WIF pool/provider trusting `https://oidc.vercel.com/<team>`, grant `workloadIdentityUser` on the SA + GA4 Viewer. (Tracked in [DEPLOYMENT_ENV.md](../DEPLOYMENT_ENV.md) §5.)

## 11. Monitoring & alerts
- ✅ In-app ops notification engine (Slack/email/SMS) + incident correlation/escalation wired; cron self-alerts on failure.
- 🔲 **Live test.** Set the Slack webhook(s) + (optional) MSG91; trigger a test alert; confirm the daily/digest reports post at 09:00 / 18:00 IST.

## 12. Backups & rollback
- ✅ Rollback runbook ([ROLLBACK_AND_RECOVERY.md](./ROLLBACK_AND_RECOVERY.md)): Vercel instant rollback, `git revert`, forward-fix migrations.
- 🔲 **Confirm in dashboard.** Supabase **daily backups** present; **PITR is a paid add-on — not assumed** (decide if you want it). Note worst-case ≤24h loss on daily-only.

## 13. Domain & HTTPS
- 🔲 **Live test.** Add `samorahstudio.com` (+`www`) in Vercel → Domains; DNS per Vercel; confirm auto-HTTPS/cert, `www`→apex redirect, and `NEXT_PUBLIC_SITE_DOMAIN=samorahstudio.com`.

## 14. Cloudinary (image CDN)
- ✅ Product imagery is Cloudinary-hosted (`res.cloudinary.com/l3xwxqah/samorah/products/*`); **all 24 catalogue image URLs return HTTP 200** (per-product inventory in [PROD_TEST_INCIDENT.md](./PROD_TEST_INCIDENT.md)). No Supabase Storage in use.
- 🔲 Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (public) in Production; `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` (server-only, admin upload) if admins upload media; confirm the CSP/next-image config allows the Cloudinary host.

## 15. Security (pre-traffic)
- ✅ Privileged RPCs revoked from anon (coupon ×4 + `analytics_refresh_mvs`) — **in the pending migrations**; RLS proven (anon/customer cannot mutate orders/inventory/payments/customers); no server secret in the client bundle; admin API routes guarded; test guard prevents prod writes from tests.
- 🔲 **Apply the 4 migrations** so the anon revokes take effect on Production (they are currently still exposed on hosted until applied — [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)); confirm the `has_function_privilege` check returns all-false after; verify no `SUPABASE_SERVICE_ROLE_KEY`/`CRON_SECRET` in Preview.

---
### Launch-blocking before first public traffic
Migrations applied ([DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)) · env scoping (§2) · Razorpay live + webhook (§6) · Auth redirects (§5) · domain/HTTPS (§13) · catalogue gate green (§9) · Spend Management ([COST_CONTROLS.md](./COST_CONTROLS.md)).
### Resolve first (from the test incident)
Decide on the `audit_events` cleanup + footer restore ([PROD_TEST_INCIDENT.md](./PROD_TEST_INCIDENT.md)).
