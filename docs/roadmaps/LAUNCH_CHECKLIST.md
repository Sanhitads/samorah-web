# Pre-Launch Hosting & Go-Live Checklist

> Actionable to-do list to take Samorah live on Vercel + `samorahstudio.com`. Ordered so each step
> unblocks the next. Nothing here is code — it's hosting, DNS, environment, and data configuration.
> Companion docs: **`DEPLOYMENT_ENV.md`** (every env var + runtime impact), **`roadmaps/PRODUCTION_DATA_IMPORT_RUNBOOK.md`**
> (catalog import), and the 3-gate launch status in memory.

---

## A. Vercel project

- [ ] Create/confirm the Vercel project is connected to the `replatform/nextjs` repo (production branch).
- [ ] Framework preset = **Next.js**; build command default (`next build`); Node version matches local.
- [ ] Confirm the build succeeds on Vercel (a green deploy does **not** prove env is set — see §C).
- [ ] Vercel **Cron** is enabled (needs a Pro plan). `vercel.json` already declares the schedules —
      confirm they appear under Project → Cron Jobs after the first deploy.

## B. Domain (samorahstudio.com primary + aliases redirect)

- [ ] Add **`samorahstudio.com`** (and `www.samorahstudio.com`) to the Vercel project as the **primary** domain.
- [ ] Point the registrar's DNS for `samorahstudio.com` at Vercel (A/ALIAS or the Vercel nameservers).
- [ ] Add the alias domains **`samorah.in`, `samorah.co`, `samorah.store`** to the project and set each to
      **Redirect (301) → `samorahstudio.com`** (Vercel's per-domain "Redirect to" option). This is the actual
      redirect — the code already assumes it (`src/config/site.ts` lists these as aliases).
- [ ] Verify SSL/HTTPS is issued for the primary and all aliases (Vercel auto-provisions).
- [ ] After DNS propagates: hitting `https://samorah.in` / `.co` **301s to** `https://samorahstudio.com`.

## C. Environment variables (Vercel → Settings → Environment Variables, scope = **Production**)

> Full list + "runtime impact if missing" is in **`DEPLOYMENT_ENV.md`**. `NEXT_PUBLIC_*` are inlined at
> build time → **a redeploy is required** after adding/changing any of them. Set values for the Production
> environment (Preview/Dev can differ).

**Domain / URLs (this is the one that bites — email & webhook links go blank if unset):**
- [ ] `NEXT_PUBLIC_SITE_URL = https://samorahstudio.com`
- [ ] `NEXT_PUBLIC_SITE_DOMAIN = samorahstudio.com` *(optional — already defaults to this)*

**Supabase (production project — NOT the local/dev one):**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_URL` if used)

**Payments — Razorpay (switch from TEST to LIVE at go-live):**
- [ ] `NEXT_PUBLIC_RAZORPAY_KEY_ID` = **`rzp_live_…`**, `RAZORPAY_KEY_SECRET` (live), `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ACCOUNT_ID`

**Fulfillment / webhooks:**
- [ ] `SHIPPING_WEBHOOK_SECRET` — **currently unset** (the shipping webhook fails closed / 503 until set). Set it, then register it on the courier's webhook config.
- [ ] `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPPING_PROVIDER`

**Email (Resend):**
- [ ] `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_PROVIDER` — verify sending **domain is verified** in Resend (SPF/DKIM on `samorahstudio.com`).

**Secrets & jobs:**
- [ ] `CRON_SECRET` (Vercel Cron sends it as `Authorization: Bearer`), `ORDER_TOKEN_SECRET`, `IP_HASH_SALT`

**Media (Cloudinary):**
- [ ] `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`

**Analytics (optional but recommended):**
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_CLARITY_ID` + `CLARITY_API_*`
- [ ] GA4 Data API (server): `GA4_PROPERTY_ID`, `GA4_API_SECRET`, and the keyless WIF vars (`GA4_CLIENT_EMAIL`/`GA4_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_AUDIENCE`) — **reminder recorded separately to wire these after the first deploy.**

**Alerts (optional):** `SLACK_WEBHOOK_URL`, `WHATSAPP_*` / `MSG91_*`.

- [ ] **Redeploy** after all Production env vars are entered (mandatory for `NEXT_PUBLIC_*`).

## D. Production database (Supabase)

- [ ] Create/confirm the **production** Supabase project (separate from local/dev).
- [ ] Apply **all migrations** (`supabase db push` against prod). Recently added, must be present:
      `20260901120000_contact_enquiries`, `20260903120000_product_image_focal`, `20260912120000_collection_seo_canonical`.
- [ ] Reload PostgREST after DDL (Supabase does this automatically on push; verify the new columns/tables are visible via the API).
- [ ] Confirm RLS is enabled on all money/PII tables (already enforced by migrations — spot-check `orders`, `refunds`, `payment_attempts`).
- [ ] Confirm the inventory authority is live (`UPDATE(stock)` revoked from service_role) so stock only moves via the ledger.

## E. Production data (Gate 2 — see the import runbook)

- [ ] Resolve the catalog taxonomy + import per **`roadmaps/PRODUCTION_DATA_IMPORT_RUNBOOK.md`** (its §11 authorization gate must be fully checked).
- [ ] Real support phone set (replaces `+91 00000 00000` in `config/commerce.ts`), GSTIN/legal confirmed, real product photography + per-product SEO.
- [ ] **No** `[TEST]` coupons in production (never run `scripts/seed-test-coupons.mjs` against prod).

## F. External integrations — go-live verification (Gate 3)

- [ ] **Razorpay:** live keys set; run one **real low-value** order end-to-end (order → verify → webhook → order created → inventory consumed), then a **refund**. Register the webhook URL (`/api/razorpay/webhook`) + secret in the Razorpay dashboard.
- [ ] **Shiprocket:** live/test-confirmed account; create one shipment from a paid order; register the courier tracking webhook (`/api/webhooks/shipping/[provider]`) with `SHIPPING_WEBHOOK_SECRET`.
- [ ] **Resend:** send one real transactional email to a controlled inbox; confirm branding, links (must be `samorahstudio.com`), and no localhost/placeholder.
- [ ] **Cron:** confirm each `vercel.json` job runs (check Vercel Cron logs) and returns 200 (not 401 → `CRON_SECRET` mismatch).

## G. Post-deploy smoke test (on samorahstudio.com)

- [ ] Home · Shop All · a Collection/Chapter · a Candle PDP · a Room/Linen PDP all render with real data + images.
- [ ] `https://samorah.in` and `.co` **301** to `.com`.
- [ ] `robots.txt` and `sitemap.xml` reference **samorahstudio.com**; canonical tags are correct.
- [ ] Add to cart → checkout → Razorpay (test one real order) → order confirmation email arrives.
- [ ] Admin loads; inventory adjust works (requires an **admin**-role account — see the roles note below).
- [ ] Analytics firing (GA4/GTM/Clarity) in production.

## H. Notes / gotchas

- **Env changes need a redeploy** — especially `NEXT_PUBLIC_*` (baked into the build).
- **A green Vercel deploy proves nothing about env** — the app builds fine with everything missing; the failure is at runtime. Use §G to prove it actually works.
- **Admin access:** to adjust inventory / manage catalog, the account needs the **`admin`** (or `super_admin`) role in `public.users` — the default seed users are `editor` and cannot adjust stock.
- **Optional hardening (post-launch):** route the email/webhook link builders through `productionOrigin()` (`config/site.ts`) instead of reading `NEXT_PUBLIC_SITE_URL` directly, so links stay correct even if the env var is ever misconfigured.

---

**Definition of done:** all of §A–§F checked, §G smoke test green on `https://samorahstudio.com`, and the
3-gate status flips to GREEN (engineering ✓, data ✓, integration ✓).
