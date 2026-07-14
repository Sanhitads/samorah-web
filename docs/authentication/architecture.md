# Authentication & Account — Architecture

The single reference for how SAMORAH authenticates customers and keeps their account state
(cart, wishlist, preferences, devices, audit trail) correct across devices. Companion to
the privacy/retention posture in [../AUTH_PRIVACY.md](../AUTH_PRIVACY.md) and the run-book in
[../../OPERATIONS.md](../../OPERATIONS.md).

**Status:** frozen subsystem. This document describes what exists in code today; the
[Roadmap](#roadmap--deliberately-deferred) at the end records what is intentionally *not* built
and the trigger for building it.

---

## 1. Component map

| Layer | Files | Role |
|---|---|---|
| Supabase clients | `src/lib/supabase/{client,server,admin,middleware}.ts` | browser / RSC session / service-role / cookie refresh |
| Auth surface | `src/app/login`, `src/app/register`, `src/app/auth/callback/route.ts`, `src/components/auth/*` | Google · email+password · magic link · flame loader |
| Session glue | `src/components/auth/AuthProvider.tsx`, `src/hooks/useAuth.ts`, `src/store/useUserStore.ts` | `onAuthStateChange` → store, first-login side effects |
| Account API | `src/app/api/account/{sync,login-event,profile,audit}/route.ts` | state sync, login capture, profile writes, client audit |
| Account logic | `src/lib/account/{merge,prefs,privacy,avatar,device,redirect}.ts` | pure, unit-tested algorithms |
| Services | `src/services/{accountService,accountAuditService}.ts` | reads/writes over the account tables |
| Retention | `src/app/api/cron/retention/route.ts` + `vercel.json` | daily purge to retention windows |

The account **algorithms live in `src/lib/account/*` as pure functions** precisely so they can be
tested without a browser or a database (see [§9 Tests](#9-testing)).

---

## 2. Authentication flows

Three methods, all converging on one Supabase session + one `public.users` row.

### 2.1 Email + password
`signInWithPassword` / `signUp`. New sign-ups fire the `handle_new_user` trigger (below).

### 2.2 Magic link (OTP)
`signInWithOtp({ emailRedirectTo: /auth/callback })` → email link → callback exchanges the code.
Supabase rate-limits OTP issuance server-side; we do not re-implement that.

### 2.3 Google OAuth (PKCE)
`signInWithOAuth({ provider: 'google', redirectTo: /auth/callback?next=<path> })` → Google →
`/auth/callback` → `exchangeCodeForSession`. PKCE + the `state` parameter (CSRF) are owned by
Supabase; our callback never inspects `state`.

### 2.4 First-login profile creation
The Postgres trigger `handle_new_user` (migration `20260715120000_account_sync.sql`, re-created in
later migrations) inserts `public.users` on `auth.users` insert — `coalesce(full_name, name)`,
avatar from `picture`/`avatar_url`, `on conflict do nothing`. One code path serves both email
sign-up and OAuth first login; no app code creates the profile, so it cannot race the session.

---

## 3. OAuth redirect lifecycle & open-redirect safety

The originating page is carried through the whole hop as `?next=<relative-path>`:

```
/shop/amber-noir  →  login (next=/shop/amber-noir)  →  Google  →
/auth/callback?next=/shop/amber-noir  →  exchangeCodeForSession  →  redirect(origin + next)
```

`next` is **always** passed through `safeNextPath()` (`src/lib/account/redirect.ts`) before use — in
the callback, the login auto-redirect, and the Google button. It honours only relative in-app paths
and rejects absolute URLs, protocol-relative `//host`, and `/\` tricks, falling back to `/`. This is
the single choke point that returns a customer to the product page they came from **without** letting
a crafted `next` bounce them to an attacker's origin. Covered by `redirect.test.ts`.

---

## 4. Session lifecycle

- **Refresh:** `middleware.ts` → `updateSession` refreshes the auth cookies on navigation.
- **Propagation:** `AuthProvider` subscribes to `onAuthStateChange`; on `SIGNED_IN` it POSTs
  `/api/account/login-event`, fires analytics, and stamps `localStorage.samorah_welcome` on first
  login. `useUserStore` mirrors `{ user, role, isLoggedIn }` for the UI.
- **Sign-out everywhere else:** a password change (`/account/update-password`) calls
  `signOut({ scope: 'others' })` so other devices' sessions are revoked while the current one stays.
  "Sign out other devices" in `DeviceSessions` does the same on demand.

---

## 5. Device management

`login-event` parses the User-Agent (device class + browser) and upserts `user_devices`
(`user_id`, `device_id`, label, `last_active_at`). `device_id` is a client UUID minted once in
`localStorage.samorah_device` (`src/lib/account/device.ts`) and sent with each login event, so the
same physical device coalesces to one row instead of one-per-session. The account page lists devices
and offers the "sign out other devices" control (§4).

---

## 6. Account sync & merge (cross-device continuity)

`/api/account/sync` (GET read, POST write) persists `account_state(cart, wishlist, prefs, tombstones)`.

**Convergence, not clobber.** Every POST does a server-side **read-merge-write**: incoming state is
merged with the currently-stored state before writing. So two devices writing near-simultaneously
converge to the same result — optimistic concurrency without version conflicts or locks.

**Merge rule (`src/lib/account/merge.ts`): last-write-wins per line by `updatedAt`.** If a device
intentionally lowered a quantity, its newer line wins over another device's older higher quantity —
a naïve `MAX(qty)` would wrongly resurrect the higher value. Exact-timestamp ties break toward the
higher quantity for determinism.

**Guards:** `sanitizeCart`/`sanitizeWishlist` cap lines (`MAX_CART_LINES=100`, `MAX_WISHLIST=300`)
and clamp quantities; `withinSize` rejects payloads over `MAX_PAYLOAD_BYTES=256 KB`; `normalizePrefs`
upgrades any older/partial prefs blob to the current `PREFS_SCHEMA_VERSION`. The wishlist is also
mirrored into the relational `wishlists` table for CRM/Customer-360 reads.

### 6.1 Tombstone deletion sync
Removing a line records a tombstone `{ key: deletedAt }` (persisted in the store + synced). On merge,
a line is dropped **iff** a tombstone for its identity is newer than the line's own `updatedAt` —
so a deletion on device A propagates to device B instead of being revived from B's stale copy. A
genuine **re-add** (newer `updatedAt`) beats the tombstone and revives the line. Tombstones prune
after a **30-day TTL** (`TOMBSTONE_TTL_MS`). Covered exhaustively by `merge.test.ts` (propagate,
revive, TTL prune). This is the offline-delete-stays-deleted guarantee.

---

## 7. Audit pipeline

Two independent streams, both keyed by `user_id`:

- **`login_history`** — one row per successful sign-in (provider, hashed IP, `device_id`, coarse
  country). Powers the account "recent sign-ins" list and fraud/support review.
- **`account_audit_log`** — semantic account events (`login`, `logout`, `password_change`,
  `email_change`, `profile_update`, `address_change`, `wishlist_change`, `newsletter_change`) written
  via `logAccountEvent()` (`accountAuditService.ts`, non-blocking insert). Surfaced in CRM Customer
  360 "Account activity"; **never** shown to the customer.

Writes go through the admin client after session verification; reads are RLS-owner-scoped (customer
sees own) plus service-role (staff CRM). IPs are salted-SHA-256 hashed — raw IPs are never stored
(see AUTH_PRIVACY.md).

---

## 8. Rate limiting

`src/lib/rateLimit.ts` — in-memory fixed-window limiter keyed by `bucket:ip`. Applied to:

| Endpoint | Bucket | Limit / window |
|---|---|---|
| `/api/account/login-event` | `login-event` | 20 / 60s |
| `/api/account/sync` (POST) | `account-sync` | 60 / 60s |
| `/api/account/profile` | `account-profile` | 20 / 60s |
| `/api/account/audit` | `account-audit` | 20 / 60s |

Over-limit → **HTTP 429 + `Retry-After`**. Magic-link/OTP is rate-limited by Supabase upstream.

**Fail-open is precisely scoped.** A request is allowed through *only when the limiter itself throws*
— i.e. the limiter infrastructure is unavailable (a bug, or a down Redis after we migrate). A normal
threshold breach is **not** an error: it takes the over-limit branch and returns `{ ok: false }` →
429. So enforcement never silently switches off under load; it only degrades to allow-through if its
own store is broken, so a limiter fault can never block checkout or login. Verified by
`rateLimit.test.ts` (breach still returns `ok:false`; window recovery after cooldown).

**Scaling note:** the store is per-instance (per Vercel lambda). Correct for a single instance / dev.
When horizontal scaling lands, swap the `Map` for Upstash Redis — the `rateLimit()` signature and the
429 contract stay identical, and fail-open then means "Redis unreachable."

---

## 9. Testing

Pure account logic is unit-tested (Vitest, no browser/DB needed):

| Suite | Covers |
|---|---|
| `lib/account/merge.test.ts` | LWW merge, intentional-decrement, tombstone propagate/revive, 30-day TTL prune, sanitize caps, size guard |
| `lib/account/redirect.test.ts` | open-redirect guard (relative honoured; absolute / `//` / `/\` rejected) |
| `lib/account/prefs.test.ts` | prefs schema-version stamping + forward-compatible partial upgrade |
| `lib/rateLimit.test.ts` | limit→429, IP/bucket isolation, **window recovery**, fail-open scoped to faults, `tooManyRequests()` shape |

**Browser-level E2E (Google round-trip, cookie-based session invalidation, deletion cascade at the
DB) is not yet automated** — there is no Playwright harness in the repo. Those flows are exercised
via the pure-logic tests above (the redirect guard, the merge/tombstone engine, the limiter) plus
manual verification. Adding Playwright is the one open item from the point-3 request; it is a harness
addition, not a code change, and is tracked in the roadmap.

---

## 10. Database & index review (point 4)

All hot account queries filter by `user_id` and order by `created_at`/`last_active_at`. Each has a
matching index — the query planner uses an index scan, never a seq scan, for every Customer-360 and
account-screen read:

| Query | Table | Index |
|---|---|---|
| recent sign-ins (`user_id`, newest first) | `login_history` | `login_history_user_idx (user_id, created_at desc)` |
| retention purge (`created_at < cutoff`) | `login_history` | `login_history_purge_idx (created_at)` |
| account activity (`user_id`, newest first) | `account_audit_log` | `account_audit_user_idx (user_id, created_at desc)` |
| retention purge | `account_audit_log` | `account_audit_purge_idx (created_at)` |
| devices list (`user_id`, last active) | `user_devices` | `user_devices_user_idx (user_id, last_active_at desc)` |
| linked providers (`user_id`) | `user_auth_providers` | `user_auth_providers_user_idx (user_id)` + unique `(user_id, provider)` |
| account state | `account_state` | PK `(user_id)` |
| orders (Customer 360) | `orders` | `orders_user_id_idx (user_id)` |
| wishlist (Customer 360) | `wishlists` | `wishlists_user_id_idx (user_id)` |

**Verdict:** coverage is complete for the current read patterns; no new index is required. The one
composite worth adding *only if* audit-search-by-event ships (roadmap #7) is
`account_audit_log (user_id, event, created_at desc)`.

---

## Roadmap — deliberately deferred

These were reviewed in the final hardening pass and **intentionally not built**, to honour the
"no new features, don't break contracts" constraint on a frozen subsystem. Each records the trigger
that should reopen it.

| # | Item | Decision & trigger |
|---|---|---|
| 6 | **Background job queue** | Cron (`vercel.json`) is correct at current scale. Migrate retention/avatar-cache/email/analytics onto a durable queue (Upstash QStash or `pg`-backed) when a job needs retries/backoff or exceeds the cron window. |
| 7 | **Audit search for support** | Add an `event`/date filter to CRM "Account activity" + the `(user_id, event, created_at)` index (§10). Small, additive; do when CS volume needs it. |
| 8 | **Auth health dashboard** | Login success %, magic-link %, Google %, failures, avg login time. Data already flows to GA4 via `track()`; surface it through the existing admin Health/Reports pattern rather than a new pipeline. |
| 9 | **Admin impersonation** | *Design carefully, do not ship casually.* Must be: capability-gated to privileged staff, **read-only**, time-boxed, and itself audit-logged on both enter and exit — impersonation must never bypass the audit trail. Build only behind an internal support-tool requirement. |
| 10 | **Notification center wiring** | The two-class notification center already exists (operational + event). Emitting account events (password changed, Google connected, new device) into it is wiring, not new infrastructure — do alongside #11. |
| 11 | **Customer timeline** | Unify `account_audit_log` + `login_history` + orders + analytics into one chronological Customer-360 stream. The heart of Customer 360; build when CS asks for a single timeline view. |
| 12 | **Event sourcing** | Domain events → event bus → read models. Explicitly **not needed now** — only at ~100k+ customers when read/write models must diverge. |
