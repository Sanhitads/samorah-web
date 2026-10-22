# Environment Variables — Local vs Preview vs Production

> **The authoritative per-variable reference** (every `process.env.*`, runtime impact if missing,
> where to get each value, the copy-paste go-live set) is [`../DEPLOYMENT_ENV.md`](../DEPLOYMENT_ENV.md).
> This doc adds what that one doesn't: **which value each environment gets**, and a browser-safety review.

## The separation rule

| | Local (`.env.local`) | Vercel **Preview** | Vercel **Production** |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local `http://127.0.0.1:54321` | hosted project URL | hosted project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local (from `db:status`) | hosted **anon** | hosted **anon** |
| `SUPABASE_SERVICE_ROLE_KEY` | local secret | ⚠️ **a non-production / scoped key, or omit** | hosted **service_role** |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_…` | `rzp_test_…` | `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | test secret | test secret | **live secret** |
| `RAZORPAY_WEBHOOK_SECRET` | test / blank | test / blank | **live webhook secret** |
| `RESEND_API_KEY` | blank (Mailpit) | blank / test | **live** |
| `CRON_SECRET` | any dev string | any string | **strong random** |
| `ORDER_TOKEN_SECRET`, `IP_HASH_SALT` | dev strings | random | **dedicated random** |
| `NEXT_PUBLIC_SITE_DOMAIN` | localhost | preview URL (auto) | `samorahstudio.com` |
| Cloudinary cloud/key/secret | optional | same as prod or test | live |
| Analytics IDs | usually blank | blank (Preview is `noindex`) | live IDs |

### Preview is deliberately defanged

The app treats non-production as test-only, and you must keep it that way:

- **No live payments.** Preview uses Razorpay **Test** keys, so a checkout in Preview never charges a
  real card.
- **No production `service_role` key in Preview.** The service-role key bypasses RLS and can read/write
  everything. Keeping it out of Preview means a Preview build cannot mutate production data even if code
  tries. If a Preview needs server DB access, scope it to a non-production database or a limited key.
- **Not indexable.** `robotsForEnv()` emits `noindex` whenever `VERCEL_ENV !== 'production'`, so Preview
  URLs never reach search results.
- **No real stock mutation / email sends** against production.

**Verified (source + live DB).** Even a *logged-in* Preview user cannot modify production data:
- **Client-side (RLS):** the anon role has **no table privileges** on `orders`/`payment_attempts`/
  `refunds`/`inventory_movements`/`stock_reservations` (error 42501), and an authenticated **customer**
  sees only their own `users` row + own `orders`, cannot `UPDATE orders` (0 rows, RLS), and cannot change
  `users.role` (column-grant denied — no self-escalation).
- **Server-side (routes):** every order/payment/inventory/admin-mutation route goes through
  `createAdminClient()`, which **throws without `SUPABASE_SERVICE_ROLE_KEY`**, and through SECURITY
  DEFINER RPCs revoked from anon/authenticated. With no service-role key in Preview, those routes 500
  and write nothing.
- **Enforcement:** (1) keep `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` out of the Preview scope in
  Vercel (the load-bearing condition — verify it in the dashboard); (2) enable **Vercel Authentication**
  on Preview so untrusted traffic can't reach a build wired to the prod DB. `noindex` is not a control.

## Browser-safety review of `NEXT_PUBLIC_*`

Anything prefixed `NEXT_PUBLIC_` is inlined into the client bundle and is **world-readable**. Every such
variable in this codebase is safe by design — none carries a secret:

| Variable | Why it's safe to expose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Just an endpoint URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **anon** key is *meant* to be public; Row-Level Security is what protects data, not key secrecy. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Public Checkout identifier by Razorpay's design; the **secret** (`RAZORPAY_KEY_SECRET`) is server-only. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public account handle used in asset URLs. |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_DOMAIN` | Public site addresses. |
| `NEXT_PUBLIC_GA_*` / `GTM_ID` / `CLARITY_ID` / `META_PIXEL_ID` / `ANALYTICS_DEBUG` | Analytics property IDs are public by design (they ship in the page already). |

**Secrets that must never gain a `NEXT_PUBLIC_` prefix** (confirmed server-only today):
`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`,
`ORDER_TOKEN_SECRET`, `IP_HASH_SALT`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`, `GA4_API_SECRET`,
`CLARITY_API_TOKEN`. Adding `NEXT_PUBLIC_` to any of these would leak it into the browser.

## Secret hygiene

- `.env`, `.env.local`, and all `.env*.local` files are gitignored; only `.env.local.example`
  (placeholders, no secrets) is committed. Verified: no secret is committed to the repo.
- Generate production secrets fresh — don't reuse local dev values:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Set Vercel variables per-environment (Production / Preview / Development scopes) so Preview never
  inherits a production secret.
- **Vercel OIDC:** enable *Settings → Security → OIDC Federation* so `VERCEL_OIDC_TOKEN` is injected
  (used for keyless GA4 Data API later). Never set it by hand.
