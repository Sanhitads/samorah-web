# Premium Page Transition — ADOPTED · FROZEN

> **Status:** ✅ **ADOPTED · FROZEN.** The verified implementation in `src/app/(store)/template.tsx`
> (Commit `55201b9`) is the **canonical** storefront page-transition behavior. It must not be casually edited
> in place — see the Freeze Rule (§7).

A subordinate navigation polish: on **client-side navigation only**, the destination storefront content gently
fades in. It makes navigation feel intentional without becoming a visible animation spectacle — the
destination stays the focus; the transition is subordinate to it.

## 1. Approved behavior (exact, frozen)
- **Client-side navigation only** (Link/router). First load / refresh / direct URL / deep link / new tab →
  **fully visible immediately (opacity 1)**, never a fade (no flash, no hydration mismatch).
- **Enter-only** · **opacity-only** (`0 → 1`).
- **Duration `0.8s`**, easing **`[0, 0, 0.2, 1]`** (mirrors the Motion Design System content-entrance
  `components/ui/Reveal` — `--motion-reveal-duration` / `--motion-ease-out`; no new token).
- **Pathname-keyed** (`key={usePathname()}`) so **both cross-segment and intra-segment** navigation fades
  (see §2).
- **No** transform · **no** translateY · **no** scale · **no** filter · **no** overlay/wipe/background
  animation · **no** exit animation · **no** `AnimatePresence` · **no** `mode="wait"`.
- **Destination remains immediately interactive** while fading (opacity-only never blocks hit-testing;
  verified: wrapper `pointer-events` stays `auto` in every sub-1 sample).
- **Reduced motion** (`useReducedMotion()`, the single canonical authority) → **no fade** (immediate/static).
- **Header/chrome remains OUTSIDE the transition** — it lives in `(store)/layout.tsx` (which persists) and
  never transitions; only the page content (`template.tsx`'s children) fades.
- **Sticky/fixed elements unaffected** — the wrapper `transform` is always `none`, so no CSS containing block
  and no scroll container are created; document geometry and scroll position are untouched.

## 2. The intra-segment fix (the load-bearing correction)
Next.js App Router re-instantiates a `template.tsx` **only when its direct child segment changes.** Navigating
*deeper within the same first segment* (`/shop` → `/shop/[slug]`, `PDP → PDP`) **reuses** the template — no
fresh mount, so a mount-driven fade never fired. The premium transition silently skipped the core shopping
flow (product↔product, shop→product).

**Fix (smallest correct, `template.tsx` only):**
- **`key={usePathname()}`** on the `motion.div` → a **new element on every pathname change**, so the enter fade
  fires on every client navigation, including intra-segment ones (`/shop → PDP`, `PDP → PDP`).
- Read the **live** module-scope **`hasNavigated`** at render (not a one-time `useRef` snapshot) so a keyed
  re-mount on a **reused** template still reflects the current navigation state. This is required for the
  **direct-load `/shop` → PDP** case (the first nav is intra-segment on a reused instance), which a keyed
  snapshot alone would miss. The **first-load guard is preserved**: SSR + first client render both read
  `hasNavigated === false` → `initial={false}` → opacity 1 (no flash); each later pathname change re-mounts
  the wrapper with `hasNavigated === true` → fade.

## 3. Why opacity-only (design rationale — frozen)
The storefront contains many `position: sticky` (PDP buy-box `top:96px`, checkout summary, bundle) and
`position: fixed` bars. A persistent wrapper **`transform`** would create a CSS **containing block** that
relocates/breaks those, and a scroll container that breaks `sticky`. **`opacity` creates neither** a containing
block for `fixed` nor a scroll container for `sticky`, so document geometry and scroll position are provably
untouched. Therefore the transition is opacity-only; a translateY/rise was evaluated and **rejected**.

## 4. Browser review outcome + verified navigation matrix
Reviewed in-browser and **approved for adoption** after the intra-segment fix. Objective verification (headless
Playwright, real client navigations against the live storefront):

| Case | Result |
|---|---|
| First load / refresh / direct URL / deep link (`/our-story`, `/shop`, PDP) | ✅ opacity **1** immediately (no fade); 0 hydration warnings |
| **`/shop` → PDP** | ✅ fade (min **0.000**) |
| **PDP → PDP** (still-after-rain → rainforest-bloom) | ✅ fade (min **0.000**) |
| **direct-load `/shop` → PDP** (Scenario B) | ✅ fade (min **0.000**) |
| Cross-segment (our-story↔shop, PDP→our-story) | ✅ fade |
| Back / forward | ✅ settle visible (not stuck) |
| Rapid repeated / interrupted navigation | ✅ final destination visible, not stuck |
| Reduced motion | ✅ no fade (static) |
| Destination interactive during fade | ✅ `pointer-events: auto` (739 mid-fade samples, 0 blocked) |
| Wrapper `transform` during fade | ✅ always **`none`** (sticky/fixed safe, no layout shift) |
| PDP `loading.tsx` interaction (slow PDP→PDP) | ✅ stale PDP replaced, **exactly one fade**, no second fade |
| tsc · ESLint · production build · luxury-experience tests | ✅ 0 · clean · exit 0 · 92/92 |

## 5. Pre-existing PDP back-scroll-restoration anomaly (OUT OF SCOPE)
On a tall `force-dynamic`/ISR PDP, browser **Back** can restore to the wrong scroll position. This is
**pre-existing** and **independently reproduced with the transition entirely removed** (identical result), so
it is **not** a transition regression. It is **explicitly outside this phase** and **must not** be fixed as
part of this transition freeze — it is tracked separately.

## 6. Rollback
Plain **`git revert 55201b9`** — restores the previous (keyless) transition exactly. The change is a single
file (`template.tsx`); nothing else depends on it. `loading.tsx` and everything else are independent.

## 7. 🔒 Freeze Rule (binding)
> **Any future change to the page-transition behavior must begin with a new architecture/review cycle and its
> own re-freeze. The frozen transition must NOT be casually edited in place.** This covers duration, easing,
> the opacity-only decision, the pathname-key mechanism, the first-load guard, and reduced-motion behavior —
> each is part of the frozen contract above.

## 8. Independence & boundaries
- **Match Strike Intro** remains independently **frozen** — untouched by this phase; it is a homepage overlay,
  outside `template.tsx`.
- **Ambient Lighting Engine** remains independently **frozen**; **Cursor Bend** remains
  **validation/reference-only**; **Scroll Breathe** remains **adopted/reusable/dormant** and is **not**
  attached by this phase. This transition adds no lighting.
- The separate **PDP `loading.tsx`** change (Commit `0f2de83`) is **NOT part of the transition
  implementation** — it is an independent UX fix for stale-PDP-lingering during slow ISR navigation. It
  composes with the transition (loading replaces the stale PDP; the transition then performs its single enter
  fade) but is governed and rolled back separately.

## 9. Files (frozen implementation)
- **`src/app/(store)/template.tsx`** — the entire transition (client wrapper). No new dependency (Framer Motion
  `^11.18.2` already installed), no new public API, no CSS/token added, no routing/layout/analytics change.

## 10. Commit trail
- Commit 1 — `template.tsx` opacity-only proof (superseded by the intra-segment fix).
- **Commit 2 — `55201b9`** — *Fix premium transition for intra-segment navigation* (the canonical, verified
  implementation).
- **Commit 3 (this freeze record)** — documentation only; no runtime change.
