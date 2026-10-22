# Release Checklist

Run this gate before every production release. Copy it into the PR/release notes and tick it off.

## 1. Code gate (must be green)

```bash
nvm use
npm ci
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src
npm test              # vitest (full suite)
npm run build         # eslint src && next build  (optional locally; Vercel runs it on deploy)
```

- [ ] Typecheck clean
- [ ] Lint clean
- [ ] Tests green
- [ ] `git status` clean / only intended changes; `git diff --check` finds no whitespace errors

> CI (`.github/workflows/ci.yml`) runs typecheck · lint · test · **build** on every PR, with no
> secrets (the build uses dummy public env only). Vercel's per-PR **Preview** deployment is the
> additional *runtime* gate (it builds with the real env and boots the app) — confirm it went green.
>
> **Branch protection:** in GitHub → Settings → Branches, add a rule for the production branch
> (`replatform/nextjs`) that **requires the `verify` status check** (and requires a PR before merge).
> That makes the CI gate mandatory, not advisory.

## 2. Database (only if this release has schema changes)

- [ ] New migrations proven locally with `npm run db:reset` (see
      [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md))
- [ ] Change is **expand-only** this release (no drop/rename of in-use objects)
- [ ] Migration SQL reviewed (no `truncate`/unguarded `drop`/`delete`)
- [ ] Plan: apply via `supabase db push --linked` **after** code deploy (expand) or **before**
      (if new code requires the column) — decide which per expand-and-contract

## 3. Environment / config

- [ ] All **required** Production env present in Vercel (`../DEPLOYMENT_ENV.md` "go-live set")
- [ ] Production uses Razorpay **live** keys; Preview still on **test**
- [ ] `NEXT_PUBLIC_SITE_DOMAIN=samorahstudio.com` in Production
- [ ] No secret carries a `NEXT_PUBLIC_` prefix (see [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md))
- [ ] Vercel **Spend Management** threshold set ([COST_CONTROLS.md](./COST_CONTROLS.md))

## 4. Ship

```bash
# From a reviewed PR merged into the production branch (replatform/nextjs):
git tag -a vYYYY.MM.DD -m "Samorah release YYYY-MM-DD"
git push origin vYYYY.MM.DD
```

- [ ] PR merged to **production branch** (not force-pushed)
- [ ] Vercel auto-deploys the production branch; build log watched to completion
- [ ] GitHub Release created from the tag with a short changelog

## 5. Post-deploy verification (see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) §8)

- [ ] Storefront + PDP + `/shop` render real data
- [ ] `/admin` gated and working
- [ ] `robots.txt` + `sitemap.xml` on the real domain; production indexable, Preview `noindex`
- [ ] Cron jobs listed; a `CRON_SECRET`-bearer `curl` returns 200
- [ ] A real order → confirmation email sends
- [ ] View-source shows only `NEXT_PUBLIC_*` values (no server secret leaked)
- [ ] **Catalogue gate:** run `npm run verify:catalogue` with **production** `NEXT_PUBLIC_SUPABASE_URL` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` — confirms the storefront's public (anon) view actually returns active
      products with buyable variants. (A credential-free build prerenders fewer pages because DB-backed PDPs
      are ISR; page count is **not** a catalogue check — this is.)

## 6. Parked follow-ups (track, don't block the release)

- [ ] **GA4 Data API (keyless WIF):** wire `GA4_PROPERTY_ID`, `GCP_WORKLOAD_IDENTITY_AUDIENCE`,
      `GA4_SERVICE_ACCOUNT_EMAIL` + enable Vercel OIDC — *do this after the first successful deploy.*
- [ ] **Shiprocket / Resend** live credentials when those integrations go live.
- [ ] First hosted **staging** database (deferred; a second paid Supabase project) if/when needed.
