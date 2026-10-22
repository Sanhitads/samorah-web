# Vercel Deployment (Pro)

How to configure the Vercel Pro project for Samorah. This is a settings + verification guide; it does
**not** perform a deploy for you. Nothing here changes the hosted database.

> For the exact environment-variable values per environment, use
> [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) +
> [`../DEPLOYMENT_ENV.md`](../DEPLOYMENT_ENV.md) alongside this doc.

## 1. Project settings

| Setting | Value | Notes |
|---|---|---|
| Framework Preset | **Next.js** | Auto-detected. |
| Root Directory | repository root | `package.json` is at the root. |
| Build Command | *(default)* → runs `npm run build` | which is `eslint src && next build`, so **lint failures block deploys** (intended). |
| Install Command | *(default)* → `npm ci` | `package-lock.json` is committed. |
| Node.js Version | **24.x** | Read from [`.nvmrc`](../../.nvmrc) / `engines.node`. Node 20 is deprecated for new Vercel deployments (Oct 1 2026); 24.x is current LTS. Keep Vercel's setting on "match project". |
| Output | *(default)* | Standard Next.js build; no custom `output`. |

## 2. Region — match Supabase (Mumbai)

The hosted Supabase project is in **Mumbai (ap-south-1)**. Vercel Functions should run in the same
region so server-side DB calls don't cross continents.

**This is now pinned in-repo:** `vercel.json` carries `"regions": ["bom1"]`, so every Serverless
Function deploys to Mumbai by default — version-controlled and reviewable, not just a dashboard toggle.
Confirm in *Settings → Functions* that the dashboard isn't overriding it, and that **`bom1` is available
on your plan** (a single fixed region is fine on Pro; multi-region is Enterprise).

No route pins a conflicting region or the Edge runtime (verified: 0 `runtime = "edge"`, 0
`preferredRegion`, 0 per-route `regions`; 97 routes are `runtime = "nodejs"`), so the single `bom1`
default applies cleanly. This cuts latency on every server component, API route, and the 11 cron jobs
(all of which hit Supabase).

## 3. Branches

- **Production Branch = `replatform/nextjs`** — this is the real application (see
  [ARCHITECTURE.md](./ARCHITECTURE.md) for why `main` is *not*). Set it under
  *Settings → Git → Production Branch*.
- Leave **Preview Deployments** on for all other branches / PRs. Previews get the Preview-scoped env
  (test config) and are `noindex` automatically.
- If you later rename the production branch to `main`, do the lossless fast-forward in
  [ARCHITECTURE.md](./ARCHITECTURE.md#git-branch-model) first, then change this setting. Never
  force-push the production branch.

## 4. Environment variables

Add variables under *Settings → Environment Variables*, choosing the right **scope** for each
(Production / Preview / Development). Work from the "minimum go-live set" in
[`../DEPLOYMENT_ENV.md`](../DEPLOYMENT_ENV.md), applying the separation rules in
[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md):

- **Production** → hosted Supabase (anon + service_role), Razorpay **live**, Resend live, Cloudinary,
  `CRON_SECRET`, `ORDER_TOKEN_SECRET`, `IP_HASH_SALT`, `NEXT_PUBLIC_SITE_DOMAIN=samorahstudio.com`.
- **Preview** → hosted anon key, Razorpay **test**, **no production service_role key**, no live email.
- Do **not** set `NODE_ENV` or `VERCEL_*` — Vercel injects those.

Also enable **Settings → Security → OIDC Federation** (injects `VERCEL_OIDC_TOKEN`; needed for the
keyless GA4 Data API later).

## 5. Crons require Pro ✅

`vercel.json` schedules **11 cron jobs**, five at `*/5` granularity — these run **only on Vercel Pro**
(Hobby allows once-daily crons only). All 11 route files exist and are guarded by `CRON_SECRET`
(sent by Vercel Cron as `Authorization: Bearer`). The full table is in
[`../DEPLOYMENT_ENV.md`](../DEPLOYMENT_ENV.md). After deploy, confirm the jobs appear under
*Project → Cron Jobs*.

## 6. Domain

- Add `samorahstudio.com` (and `www`) under *Settings → Domains*; point DNS as Vercel instructs.
- Ensure `NEXT_PUBLIC_SITE_DOMAIN=samorahstudio.com` in Production so canonical URLs, OG tags, sitemap,
  and robots resolve to the real domain.

## 7. First production deploy

1. Confirm the [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) gate is green locally.
2. Push the production branch (or open a PR → review its Preview → merge).
3. Watch the build log: it runs `eslint src && next build`. A green build ≠ a working runtime — env
   must be set correctly (missing required env = live-but-broken; see `../DEPLOYMENT_ENV.md`).
4. Set the **Spend Management** threshold *before* traffic ramps — see [COST_CONTROLS.md](./COST_CONTROLS.md).

## 8. Post-deploy verification

- [ ] Home, a chapter, a PDP, `/shop` all render with real catalogue data.
- [ ] A **test-mode** checkout completes end-to-end (do a live sanity check deliberately, with a real
      card you control, only when you intend to).
- [ ] `/admin` loads and is gated to admin users.
- [ ] `robots.txt` / `sitemap.xml` resolve to `samorahstudio.com` and production is **indexable**
      (Preview stays `noindex`).
- [ ] Cron Jobs listed in the dashboard; a manual `curl` with the `CRON_SECRET` bearer returns 200.
- [ ] Order confirmation email sends (Resend) on a real order.
- [ ] No `SUPABASE_SERVICE_ROLE_KEY`/secret leaked to the client (view-source a page; only
      `NEXT_PUBLIC_*` values appear).

> **Do not claim a deploy is done until it is verified.** A green Vercel build only means the bundle
> compiled; the checks above are what prove the store actually works.
