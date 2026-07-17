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

## §7.2 The 8 stores — 4 built, 4 not

| BRD store | Status |
|---|---|
| `useCartStore` | ✅ persisted (`samorah_cart`) |
| `useWishlistStore` | ✅ persisted |
| `useUserStore` | ✅ in-memory |
| `useUIStore` | ✅ in-memory |
| `useCheckoutStore` | ❌ — checkout state lives in `CheckoutView` local `useState` |
| `useProductStore` | ❌ — filters/sort are URL-driven (better for SEO + shareable links) |
| `useSearchStore` | ❌ — not built |
| `useNotificationStore` | ❌ — not built (customer-facing; the admin notification engine is separate) |
| `useCompositionStore` | ➕ **not in the BRD** — project-specific (Discovery Composition), persisted |

The missing four are unbuilt features or deliberate alternatives, not defects. Empty stores added
only to match a list would be worse than no stores.

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
