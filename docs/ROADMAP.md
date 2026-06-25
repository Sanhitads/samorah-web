# ROADMAP — Samorah

> The approved phase sequence and dependencies. Status mirrors
> [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) §3–4 (the live record). **Never
> skip phases; confirm the next phase before coding.**
> **Last updated:** 2026-06-25.

## MVP (launch-critical)

| Phase | Workstream | Depends on | Status |
|---|---|---|---|
| 1 | Re-platform foundation (Next.js 15 + TS, Tailwind v4, Supabase, tokens, fonts) | — | ✅ done |
| 2 | Canonical database (33 tables, RLS, enums, grants, invoice seq, typed bindings) | 1 | ✅ done |
| 3 | State + Auth + RBAC (stores, hydration-safe `useStore`, AuthProvider, middleware, `current_user_role`) | 2 | ✅ done |
| 4 | Product Engine — 4A seed · 4B services · 4C domain | 2 | ✅ done |
| 5.5 | **SDD** (system) + **SDD-VISUAL** V2 (visual SoT) | 4 | ✅ done |
| 5.6 | **SPD** (photography / image system) | 5.5 | ✅ done |
| 6 | **Layout Chrome** — Announcement · Header · Mega Menu · Search · Cart · Footer | 4, 5.5 | ✅ done |
| **7** | **Homepage** — 9-section editorial flow; enable Header `floating` over the hero; seed `homepage_banners` (admin UI deferred) | 6 | ⏭ **next** |
| 8 | Collection / Chapter pages — 4 reusable layout templates, grids, filters | 6, 7 | ◻ pending |
| 9 | Product page — 14-section editorial scroll; variants; fragrance notes; related; GA4 events; re-wire cart auto-open (P2); narrative fields (P14) | 4, 6 | ◻ pending |
| 10 | Bundle builder — vessel tabs, composition tray, add-as-one-line (`bundleStore`) | 9 | ◻ pending |
| 11 | Cart + Checkout + reservations — coupon, gift note, GST-aware checkout, `stock_reservations` + expiry cron, `calculateOrderTotals` | 4, 10 | ◻ pending |
| 12 | Razorpay + GST + webhook_logs — create-order / verify (redirect-only) / idempotent webhook txn, Tax Invoice PDF, `/admin/webhooks` | 11 | ◻ pending |
| 13 | Shiprocket + NDR — serviceability/rate, order-on-payment, AWB, tracking webhook, NDR tab | 12 | ◻ pending |
| 14 | Email + automation — transactional templates (React Email) + abandoned-cart cron | 12 | ◻ pending |
| 15 | Admin essentials — dashboard, 6-step product form, CSV bulk, orders + NDR, inventory | 12, 13 | ◻ pending |
| 16 | SEO + analytics + security + tests — `generateMetadata`, sitemap, JSON-LD, GA4, rate-limit/CSRF/headers, Jest + Playwright | 7–9 | ◻ pending |
| 17 | Deploy + content + QA — Vercel Pro, CI/CD, DNS, **real photography per SPD** + upload, sandbox QA → **MVP LAUNCH** | 16 | ◻ pending |

> A dedicated **Search backend** (Postgres full-text, BRD P1) and the **Mobile
> Menu (Component 7)** are slotted alongside the phases that need them — see
> PROJECT_CONTEXT §6 Pending P4 / P10.

## Post-launch (after MVP is live)

- Loyalty + tiers · Gift cards (stored value) + redemption · Referral
- MSG91 phone OTP
- Banner Manager + Instagram Gallery **admin UI** · Reviews moderation · Blog/Journal
- Full analytics dashboards · audit-log UI · performance audits · backup UI
- AI/semantic search · wholesale · gift-wrap

## Design gates (already cleared)

Storefront UI (Phases 7–10) was gated on **SDD + SDD-VISUAL + SPD approval** —
all approved. Real photography (SPD) gates **launch QA (Phase 17)**, not the
build: Phases 7–10 build against gradient placeholders.
