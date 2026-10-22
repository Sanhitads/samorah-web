# Vercel Preview — Pre-Deploy Safety Checklist

Preview deployments must never be able to touch production with privileged credentials. This is a
**dashboard** checklist (settings Claude cannot read or set) — verify each item in the Vercel project
before enabling Preview against the hosted database. Rationale + evidence: [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).

## 1. Environment variables — scope these to **Production only** (absent from Preview & Development)

In *Settings → Environment Variables*, confirm each of these has **only the Production** box checked:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — the load-bearing one. Absent in Preview ⇒ `createAdminClient()` throws ⇒ every order/payment/inventory/admin mutation route 500s and writes nothing.
- [ ] `CRON_SECRET` — absent in Preview ⇒ all 11 cron routes 401 (crons are production-only).
- [ ] `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — no live payment capture/refund from Preview.
- [ ] `RESEND_API_KEY` — no live email from Preview.
- [ ] `ORDER_TOKEN_SECRET`, `IP_HASH_SALT`, `CLOUDINARY_API_SECRET`, `GA4_API_SECRET`, `CLARITY_API_TOKEN`.

## 2. Preview gets only safe values

- [ ] `NEXT_PUBLIC_RAZORPAY_KEY_ID` in Preview = `rzp_test_…` (never `rzp_live_…`).
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the hosted **anon** key (public by design; RLS-bound).
- [ ] No secret above is present in the Preview scope (re-check after any "apply to all environments" action).

## 3. Deployment Protection

- [ ] Enable **Vercel Authentication** on Preview (*Settings → Deployment Protection*) so only logged-in
      team members reach Preview builds. `noindex` is **not** a security control — it stops indexing, not access.

## 4. Lead-capture writes when Preview shares the hosted database

Even with no service-role key, the **anon** key carries direct `INSERT` grants on three public submission
tables — `newsletter`, `stock_notifications`, `wholesale_customers` (by design, for the public forms). If
Preview points at the **hosted** DB, Preview traffic (or a crawler that slips past item 3) can insert
**junk lead rows into production**. Choose at least one:

- [ ] **Best:** point Preview at a **separate non-production Supabase project** (its own URL + anon key), so
      Preview cannot write to production at all. (A second project is a paid add-on — a deliberate choice,
      not required for launch.)
- [ ] **Otherwise:** keep **Vercel Authentication** on Preview (item 3) so untrusted traffic never reaches
      the forms, **and** periodically review `newsletter` / `stock_notifications` / `wholesale_customers`
      for obvious test rows.
- [ ] Note: these three are the **only** anon-writable tables. Orders, payments, inventory, customers and
      coupons are **not** anon-writable (verified: anon gets `42501` on those), so Preview cannot create or
      alter real commerce data regardless.

## 5. After verifying

- [ ] Trigger a Preview deploy and confirm: a server route that needs the service role (e.g. an admin API)
      returns an auth/500 error, a cron route returns 401, and the page is `noindex`.
- [ ] Only then rely on Preview for review flows.
