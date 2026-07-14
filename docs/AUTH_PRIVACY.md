# Authentication, Account Data & Privacy

Reference for the account subsystem's data handling, retention, and compliance posture
(DPDP-aligned). Companion to the auth code under `src/app/api/account/*`,
`src/services/account*`, and `src/lib/account/*`.

## What we store, where, and why

| Data | Table | Purpose | PII sensitivity |
|---|---|---|---|
| Profile (name, email, avatar) | `users` | Account identity | Medium |
| Auth providers (google/email…) | `user_auth_providers` | Multi-provider linking | Low |
| Cart / wishlist / prefs | `account_state` (jsonb) | Cross-device continuity | Low |
| Login events | `login_history` | Session list, support, fraud | **IP hashed** |
| Account events | `account_audit_log` | Support + compliance trail | **IP hashed** |
| Devices | `user_devices` | "This device", last-active | Low |

## IP handling (minimisation)

Raw IP addresses are **never persisted**. `login_history.ip_hash` and
`account_audit_log.ip_hash` store a salted SHA-256 (`src/lib/account/privacy.ts`,
truncated to 32 hex chars) — enough to correlate repeat access for fraud/support, not
reversible to the address. Coarse country (`x-vercel-ip-country`) is kept for support
context. The legacy `login_history.ip` column is no longer written.

## Retention windows

| Data | Retention | Enforced by |
|---|---|---|
| `login_history` | **180 days** | `/api/cron/retention` (daily 03:00) |
| `account_audit_log` | **730 days** (2y) | `/api/cron/retention` |
| Cart/wishlist tombstones | 30 days | pruned in-merge (`lib/account/merge.ts`) |
| `account_state` | Until account deletion | cascade |
| `users` / addresses / orders | Business + tax record retention | manual / policy |

Purge indexes exist on `login_history(created_at)` and `account_audit_log(created_at)`
so retention scans stay efficient as the tables grow.

## Deletion & export (data-subject rights)

- **Deletion:** every account table references `users(id) ON DELETE CASCADE`
  (`user_auth_providers`, `account_audit_log`, `user_devices`, `login_history`,
  `account_state`, `wishlists`, `addresses`, …). Deleting the auth user removes all of
  it in one cascade — no orphan PII.
- **Export:** all account data is keyed by `user_id`, and the owning user has RLS
  `select` on their own `account_audit_log`, `login_history`, `user_devices`,
  `user_auth_providers`, and `account_state` — so a per-user export endpoint is a
  straightforward join over those tables (future `/api/account/export`).

## Access control

- `account_state`, `account_audit_log`, `login_history`, `user_devices`,
  `user_auth_providers` all have **RLS**: the owning user may read their own rows; writes
  go through the server (admin client) after session verification. Staff/CS read via the
  service role (CRM Customer 360).
- `account_audit_log` is **CS/admin-facing**, not surfaced to customers in the storefront.

## Security controls

- **Rate limiting** on `login-event`, `account/sync`, `account/profile`, `account/audit`
  (429 + `Retry-After` on breach; fail-open **only** if the limiter infra faults — never on a
  threshold breach — see [authentication/architecture.md § Rate limiting](authentication/architecture.md#8-rate-limiting)).
  Magic-link/OTP is rate-limited by Supabase.
- **Password change** revokes all *other* sessions (`signOut({ scope: 'others' })`) and
  writes a `password_change` audit event.
- **OAuth CSRF/state** is handled by Supabase PKCE (`exchangeCodeForSession`); our
  callback does not touch the state parameter.
