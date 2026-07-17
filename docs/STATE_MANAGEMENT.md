# State Management (Zustand) — BRD §7 audit

Status of every BRD §7 requirement against the code, including where we **deliberately deviate** and
why. Audited after a hydration crash traced back to §7.1.

## §7.1 Hydration fix — CRITICAL ✅ (was broken)

The BRD's pattern is implemented in `src/hooks/useStore.ts` and is now used everywhere persisted
state is **rendered**.

**It was broken, and that broke the storefront.** The implementation had drifted from the BRD:

```ts
store: (callback: (state: T) => unknown) => unknown   // BRD  ✅
store: (selector: (state: T) => F) => F               // what was built ❌
```

Constraining the store callback to `F` made TypeScript inference collapse to `{}` against zustand's
overloaded bound store, so the hook **did not type-check and was never used** — its only appearance
in the codebase was its own doc example. Hand-rolled mount guards were used instead, inconsistently,
and the components that missed one crashed the page:

| Component | Persisted state read | Blast radius |
|---|---|---|
| `CartDrawer` | cart | **every storefront route** (rendered by `StoreChrome`) |
| `AddToComposition` | composition | **product page** |
| `BundleBuilder` | cart + composition | bundles page |

Symptom: empty cart → server and client agree → fine. **Add one product → server renders empty,
client hydrates full → hydration mismatch → root error boundary ("A quiet stumble").**

The BRD's `unknown` is **load-bearing, not stylistic**. Restoring it fixed the hook; the three
components now use it.

### Rule
- **Reactive reads of persisted state** → must go through `useStore` (or an equivalent mount guard).
- **Actions** (`addItem`, `updateQty`, `clearCart`, …) → safe to read directly; they're stable
  references, not persisted data.
- **Imperative reads** (`useCartStore.getState()` inside an effect/handler, e.g. `AccountSync`) →
  safe; not part of render.

### Current guard status (all clear)
| Store (persisted) | Readers |
|---|---|
| `useCartStore` | CartView (mount guard) · CheckoutView (mount guard) · CartDrawer (`useStore`) · BundleBuilder (`useStore`) |
| `useCompositionStore` | BundleBuilder (`useStore`) · AddToComposition (`useStore`) |
| `useWishlistStore` | wishlist page (mount guard) · AccountSync (`getState()`, imperative) |
| `useCheckoutStore` | CheckoutView (mount guard — its sole reader) |

## §7.2 The 8 stores — 4 built, 4 not

| BRD store | Status |
|---|---|
| `useCartStore` | ✅ persisted (`samorah_cart`) |
| `useWishlistStore` | ✅ persisted |
| `useUserStore` | ✅ in-memory |
| `useUIStore` | ✅ in-memory |
| `useCheckoutStore` | ✅ persisted (`samorah_checkout_v1`, **sessionStorage**) — inputs only, see below |
| `useProductStore` | ❌ — filters/sort are URL-driven (better for SEO + shareable links) |
| `useSearchStore` | ❌ — not built |
| `useNotificationStore` | ❌ — not built (customer-facing; the admin notification engine is separate) |
| `useCompositionStore` | ➕ **not in the BRD** — project-specific (Discovery Composition), persisted |

The missing three are unbuilt features or deliberate alternatives, not defects. Empty stores added
only to match a list would be worse than no stores.

### `useCheckoutStore` — inputs only, and why the BRD's field list is not followed

Built to survive a cart→checkout round-trip or a refresh without wiping a filled-in address. It holds
**only what the customer typed**; every deviation from the BRD's field list is deliberate:

| Deviation | Why |
|---|---|
| **No derived state** — no subtotal, tax, shipping, discount, total, order id, payment status, invoice, webhook state | `calculateOrderTotals()` stays the **single money module**. Persisting its output invites drift between the store and the module, and stale money surviving a refresh is exactly the bug the one-money-module rule exists to prevent. |
| **No wizard fields** (`step`/`nextStep`/`prevStep`) | Checkout is a single page. There are no steps. |
| **Coupon CODE persisted, discount never** | The code is re-validated server-side on restore (`/api/coupons/apply`); prices, expiry and minimums can all change between tabs. The discount is always re-derived. |
| **`consent` not persisted** | Silently restoring a ticked consent box is not a defensible record of agreement. It re-affirms each session. |
| **sessionStorage, not localStorage** | It holds name, phone, email, address. DPDP data-minimisation: the PII dies with the tab instead of lingering on a shared device. |
| **No gift message / shipping method / payment method** | These inputs **do not exist** in this checkout — shipping is derived (free/standard), payment is Razorpay-only, and `notes` already covers order notes. Adding fields no UI writes would be dead state. Add them here *if and when* those inputs ship. |

**Cleared on:** successful placement (next to `clearCart()`), emptied cart (effect), explicit `reset()`.
**Deliberately NOT cleared on** payment-modal dismissal: a customer who closes Razorpay to fix a typo
or retry a card has not abandoned checkout, and destroying their typed address there would defeat the
store's entire purpose. The cart-empty and success paths already cover real terminal states.

Contract is pinned by `src/store/useCheckoutStore.test.ts` (CHK-001…007) — notably CHK-004, which
fails if any derived/money field ever gets persisted.

## §7.3 Cart persistence

| Scenario | Status |
|---|---|
| Guest adds to cart — Zustand + localStorage, survives refresh | ✅ |
| Guest logs in — merged with server cart | ⚠️ **intentional deviation** (below) |
| Checkout initiated — 15-min reservation, released on fail/timeout | ✅ `reserveStock` in `create-order` (TTL 15m) + `release_expired_reservations` cron |
| Payment confirmed — cart cleared (Zustand + localStorage + Supabase), inventory decremented | ✅ `clearCart` empties items **and writes tombstones** (clear propagates cross-device); `persist` wipes localStorage; AccountSync pushes to Supabase. Stock is decremented **inside the finalizer transaction, exactly once** — never double-decremented |
| Gift card applied | ❌ **correctly absent** — gift cards are deferred post-launch per the MVP scope |

### Intentional deviation: merge is LAST-WRITE-WINS, not quantity-combining

The BRD says *"duplicates have quantities combined"*. `lib/account/merge.ts` implements
**last-write-wins per line** via `updatedAt`. **This is deliberate and stays.**

**Why LWW is correct here:** the same `mergeCart` runs on **every sync POST**, not just at sign-in —
the server re-merges incoming ⊕ stored so concurrent devices converge. If it combined quantities,
**every debounced push would add the quantity again** and carts would inflate on every edit. LWW also
respects intent: if a device deliberately lowers a quantity, its newer line must beat another
device's stale higher one (MAX would wrongly keep the higher). Deletions propagate via tombstones.

**Cost of the deviation:** a guest with 2× an item who signs into an account already holding 1× of it
gets **2×, not 3×** — the line survives, one unit of quantity is dropped.

**Why we don't "fix" it:** combining could only ever apply to the one-time sign-in merge, as a
separate path needing idempotency (a retried POST must not double-count). That's real complexity and
a real double-count risk in the cart, for a marginal gain. **Decision: keep LWW; treat the BRD line
as superseded.** Revisit only if real customers report it.
