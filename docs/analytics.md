# Analytics — GA4 · GTM · Microsoft Clarity

Production analytics for Samorah. One provider-agnostic seam; components call typed
helpers (`trackAddToCart`, …) and never touch GA4/GTM/Clarity directly.

## Architecture

```
src/lib/analytics/
├── types.ts       — event names, AnalyticsItem, ConsentState, provider interface
├── config.ts      — reads IDs from env; production-only gate
├── consent.ts     — cookie-consent state (localStorage) + change events
├── ga4.ts         — GA4 provider (gtag)            ← canonical analytics path
├── gtm.ts         — GTM provider (dataLayer)       ← marketing tags only
├── clarity.ts     — Microsoft Clarity provider     ← heatmaps / recordings
├── analytics.ts   — facade: consent gate + buffer + fan-out to providers
└── events.ts      — typed helpers (the app's public API)

src/components/analytics/
├── AnalyticsProvider.tsx — loads scripts (post-consent), auto page views
├── ConsentBanner.tsx     — accept/decline strip
└── TrackEvent.tsx        — fire one event on mount (for server components)
```

**Data flow:** `component → events.ts helper → analytics facade → (consent? ) → GA4 + GTM + Clarity`.
Switching or adding a provider (e.g. Meta Pixel) touches only the provider files + the
provider list in `analytics.ts` — never a UI component.

## Environment variables (`.env.local`)

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-QRD2T860NQ   # GA4 (legacy NEXT_PUBLIC_GA_ID still honoured)
NEXT_PUBLIC_GTM_ID=GTM-PZ7MTN5F              # Google Tag Manager
NEXT_PUBLIC_CLARITY_ID=xmaw47izhv            # Microsoft Clarity
# NEXT_PUBLIC_META_PIXEL_ID=                 # Phase 3 — not yet
# NEXT_PUBLIC_ANALYTICS_DEBUG=1              # force analytics ON in dev for DebugView
```

IDs are **never hardcoded**. A provider is inert unless its ID is set, so unconfigured
providers silently no-op. Analytics only runs when `NODE_ENV=production` (or when
`NEXT_PUBLIC_ANALYTICS_DEBUG=1` for local testing).

> **Google Search Console** is verified via a meta/DNS record — no app code. Nothing to wire.

## The GA4 + GTM dual-install rule (important)

Both a GA4 tag **and** GTM are installed. To avoid double-counting every hit:

- **GA4 events flow through `gtag` directly** (`ga4.ts`) — this is the canonical path.
- **GTM is for marketing tags only** (Meta Pixel, Google Ads). It receives a `dataLayer`
  mirror of every event.
- **Do NOT add a GA4 Configuration tag inside GTM.** If you do, every event counts twice.

Page views are duplicate-free: GA4 config sets `send_page_view:false` and we fire
`page_view` manually once per App Router navigation.

## Consent & privacy

- Analytics **does not load or fire before consent** (`ConsentBanner` → Accept).
- Before consent, events are buffered in memory (max 50) and **flushed on Accept**.
- Decline → nothing loads, nothing fires.
- **No PII ever** — no email, phone, or name is passed in any event. Ecommerce items carry
  only `item_id`, `item_name`, `item_category`, `item_variant`, `price`, `quantity`.
- GA4 is configured with `anonymize_ip:true`.

## Event catalogue

| Category | Event | Helper | Fires from |
|---|---|---|---|
| Page | `page_view` | `trackPageView` | every route change (auto) |
| Product | `view_item` | `trackViewItem` | PDP (`shop/[slug]`) |
| Product | `view_item_list` / `select_item` | `trackViewItemList` / `trackSelectItem` | collection grids |
| Cart | `add_to_cart` | `trackAddToCart` | cart store `addItem` |
| Cart | `remove_from_cart` | `trackRemoveFromCart` | cart store `removeItem` |
| Cart | `view_cart` | `trackViewCart` | cart drawer/page |
| Wishlist | `add_to_wishlist` / `remove_from_wishlist` | `trackAddToWishlist` / `trackRemoveFromWishlist` | wishlist store |
| Checkout | `begin_checkout` | `trackBeginCheckout` | CheckoutView mount |
| Checkout | `add_shipping_info` / `add_payment_info` | `trackAddShippingInfo` / `trackAddPaymentInfo` | checkout / pay |
| Checkout | `purchase` | `trackPurchase` | order confirmation page |
| Search | `search` | `trackSearch` | SearchOverlay (debounced) |
| Marketing | `apply_coupon` | `trackApplyCoupon` | checkout coupon applied |
| Marketing | `newsletter_signup` | `trackNewsletterSignup` | newsletter forms |
| User | `login` / `sign_up` | `trackLogin` / `trackSignup` | AuthProvider on sign-in |
| User | `generate_lead` / `contact_form_submit` | `trackGenerateLead` / `trackContactFormSubmit` | forms |
| Payment | `payment_started` / `payment_success` / `payment_failed` | `trackPaymentStarted` / … | Razorpay flow |
| Error | `checkout_error` | `trackCheckoutError` | checkout failure paths |

### Custom parameters (ecommerce)
Every ecommerce event carries `currency` (INR) + `value`, and an `items[]` array of
`AnalyticsItem`: `item_id`, `item_name`, `item_category` (fragrance chapter), `item_variant`
(vessel · size), `item_list_name`, `price`, `quantity`.

## Expanded event vocabulary (engagement & funnels)

Beyond the core ecommerce events, a full typed vocabulary exists in `events.ts`. Helpers are
**ready to call**; those whose feature/UI doesn't exist yet are documented as such and simply
aren't wired — no dead code firing for absent features.

| Area | Events | Wired? |
|---|---|---|
| Search intelligence | `search`, `search_zero_results`, `search_abandoned`, `autocomplete_used`, `select_item` | ✅ SearchOverlay (+ first-party `search_logs`) |
| Collection / list | `view_item_list`, `view_collection` | ✅ Shop grid (`view_item_list`) |
| Product engagement | `product_impression`, `product_hover`, `quick_view`, `gallery_image_view/zoom/fullscreen`, `select_variant` | helpers ready — wire on PDP |
| Engagement | `scroll_depth` (25/50/75/100), `time_engaged` (30/60/120/300) | ✅ global `EngagementTracker` |
| Gift / bundle | `view_gift_box`, `bundle_started/completed/abandoned` | helpers ready — bundle UI exists |
| Coupon lifecycle | `apply_coupon`, `coupon_rejected`, `coupon_removed` | apply wired; reject/remove ready |
| Wishlist | `add_to_wishlist`, `remove_from_wishlist`, `wishlist_purchased`, `wishlist_reminder_click` | add/remove wired |
| Notify-Me | `notify_me_requested`, `back_in_stock_purchased` | **wire when Notify-Me UI ships** |
| Referral | `referral_shared/used/purchase` | **wire when referral ships (BRD-future)** |
| Loyalty | `points_earned/redeemed`, `tier_upgraded` | **wire when loyalty ships** |
| Blog | `blog_read`, `blog_related_click`, `blog_product_click` | helpers ready |
| Artist story | `artist_story_open/share`, `artist_cta_click` | **wire when the section ships** |
| Reviews | `review_expanded`, `review_photo_view`, `review_helpful`, `review_sort` | **wire when review UI ships** |
| Checkout funnel | `begin_checkout`, `address_completed`, `shipping_selected`, `payment_selected`, `add_payment_info`, `payment_retry`, `payment_timeout`, `purchase` | begin/payment_selected/add_payment_info/payment_* wired |

**Firehose events stay in GA4 + Clarity, not our DB.** Scroll depth, impressions, hover, and
gallery views are high-frequency behavioural signals — GA4 aggregates them and Clarity records
them (heatmaps/recordings). We do **not** duplicate them into Postgres.

## Admin analytics (first-party) — `/admin/analytics`

The admin surfaces what we can answer accurately from **our own tables** (no GA4 Data API):

- **Search intelligence** (review point 1) — top searches + **zero-result searches** ("unmet
  demand": a term searched often with 0 results is a product worth adding), from `search_logs`.
  Storefront searches are logged via `POST /api/search/log` (consent-gated, rate-limited).
- **Attribution by channel** (review point 19) — revenue/orders/share per channel, from each
  paid order's UTMs (`getChannelReport`).
- **UTM campaigns** (review point 20) — source/medium/campaign revenue table (`getCampaignReport`).
- Revenue, AOV, units, returns, refunds, courier performance (existing analytics).

**Deliberately link-out, not faked:** live users, real-time visitor counts, true visitor→order
conversion, scroll/impression heatmaps and session recordings require GA4 Realtime / the GA4 Data
API / Clarity. The page links to those rather than inventing numbers. Wiring the GA4 Data API
(service account) to pull live users into the admin is a documented future upgrade.

## Server-side tracking (authoritative commerce events)

Client events are lossy (blockers, closed tabs). Authoritative commerce events fire
**server-side** via the GA4 Measurement Protocol (`lib/analytics/server.ts`), from trusted
code where the outcome is certain:

| Event | Fired from | Note |
|---|---|---|
| `purchase` | `orderService.persistOrder` (order confirmed) | GA4 dedupes by `transaction_id`, so this is safe alongside the client purchase |
| `refund` | `refundService.issueRefund` (processed) | keyed by `order_number` to match the purchase |
| `shipment_dispatched` / `shipment_delivered` / `shipment_rto` | `shipmentService` transitions | lifecycle after the sale |

**Config:** `NEXT_PUBLIC_GA_MEASUREMENT_ID` + `GA4_API_SECRET` (GA4 Admin → Data Streams →
Measurement Protocol API secrets). No-op when the secret is unset — set it to light server
events up. All calls are non-blocking and never affect order/refund/shipment processing.

## Microsoft Clarity — metrics in the admin

Clarity behavioural metrics are pulled into `/admin/analytics` → **Behavioural · Clarity**
via the Data Export API (`clarityService.ts`): sessions, distinct users, bot sessions, avg
scroll depth, avg engagement time, and rage/dead/quick-back clicks + script errors (last 3
days — the API's max). Heatmaps + session recordings stay in the Clarity dashboard.

**Config (server-only secrets):** `CLARITY_API_TOKEN` (Clarity → Settings → Data Export →
generate token) + `CLARITY_API_ENDPOINT` (defaults to the live-insights URL). The API is
capped at **10 requests/day/project**, so the call is cached 6h (`unstable_cache`).

> ⚠️ These are **secrets** — never `NEXT_PUBLIC_*` (that inlines them into the browser bundle,
> exposing your GA4 send-secret and Clarity token to every visitor). `NEXT_PUBLIC_` is only for
> the GA4 **measurement id** and Clarity **project id**, which are meant to be public.

## What still needs a GA4 service account

The GA4 **Measurement Protocol secret** only *sends* events — it cannot *read* reports. Live
users, real-time visitors, and true visitor→order conversion require the **GA4 Data API**
(a Google Cloud service account with JSON credentials + the numeric property id). Not wired
yet; the admin honestly links out to GA4 Realtime for those.

## Wired storefront events (this pass)

- **Variant** (`select_variant`) — PDP vessel/size selection.
- **Gallery** (`gallery_image_view`, `gallery_fullscreen`) — PDP gallery.
- **Bundle** (`bundle_started/completed/abandoned`) — the Discovery Composition builder.
- **Wishlist** (`wishlist_opened`, `wishlist_purchased`) — wishlist page + checkout success.
- **Coupon** (`coupon_rejected` with the real reason) — checkout validates via `/api/coupons/apply`.
- **Search** (`search` + `search_source`, `autocomplete_used`) — SearchOverlay.

## Admin operational KPIs (`/admin/analytics` → Business overview)

First-party CEO glance (review point 11): orders today, revenue today/window, average basket,
pending/cancelled/refunded orders, COD vs prepaid share, repeat-customer rate, out-of-stock &
low-stock counts, best sellers, worst sellers (slow movers). Plus attribution-by-channel (with
AOV) and UTM campaigns (top/weakest). **ROAS/ROI need ad-spend (manual entry — not stored);
visitors/bounce/conversion need GA4** — both are surfaced as honest notes, not invented.

## Naming conventions

- Use the **GA4 recommended event names** (`add_to_cart`, `begin_checkout`, `purchase`, …)
  so GA4's built-in ecommerce reports light up automatically.
- Event names are `snake_case`; a typed union in `types.ts` keeps them consistent + greppable.
- No PII in params — ever.

## Testing (GA4 DebugView)

1. Add `NEXT_PUBLIC_ANALYTICS_DEBUG=1` to `.env.local` and run `npm run dev`.
2. Open the site, **Accept** the consent banner.
3. In GA4 → Admin → **DebugView**, watch events arrive in real time.
4. The browser console echoes every event (`[ga4] add_to_cart …`, `[gtm] …`, `[clarity] …`)
   so you can confirm shape without leaving the app.
5. Exercise the funnel: view a product → add to cart → checkout → coupon → pay → order page.
6. Verify no **duplicate** `page_view` on navigation, and that nothing fires before consent.
7. **Clarity:** open the Clarity dashboard → Recordings; sessions appear within a few minutes.

## Adding a new event

1. Add the name to the `AnalyticsEvent` union in `types.ts`.
2. Add a typed helper in `events.ts` (build the correct param shape there — call-sites stay simple).
3. Call the helper from the component/store. Never call `gtag`/`dataLayer` directly.
4. If it's a conversion milestone worth watching in recordings, add it to `TAGGED` in `clarity.ts`.

## Adding a new provider (e.g. Meta Pixel)

1. Create `src/lib/analytics/meta.ts` implementing `AnalyticsProvider` (+ an init snippet).
2. Register it in the `providers` array in `analytics.ts` and inject its script in
   `AnalyticsProvider.tsx` (gated on config + consent).
3. Done — no UI component changes. Set `NEXT_PUBLIC_META_PIXEL_ID` to light it up.

## Roadmap

- **Phase 1 (done):** GA4 · GTM · Search Console.
- **Phase 2 (done):** Microsoft Clarity — heatmaps, session recordings, rage/dead clicks.
- **Phase 3 (marketing, later):** Meta Pixel (`meta.ts` stub reserved), Pinterest Tag,
  Google Ads conversion tracking.
